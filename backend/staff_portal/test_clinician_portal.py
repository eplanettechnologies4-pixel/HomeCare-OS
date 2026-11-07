import datetime
from django.test import TestCase, RequestFactory
from django.contrib.auth import get_user_model
from django.contrib import admin
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from staff.models import StaffMember, StaffRole
from patients.models import (
    Patient, DoctorNote, PhysioNote, TherapyNote, VitalSign, NurseNote, ClinicalConsent
)
from bookings.models import Booking, BookingStatus, ServiceType, ShiftDuration
from accounts.models import AuditLog

User = get_user_model()


class ClinicianPortalPhase1Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Patients
        self.patient_a = Patient.objects.create(
            mr_number='MRN-ALPHA-001',
            patient_code='PT-ALPHA',
            first_name='Ahmed',
            last_name='Khan',
            date_of_birth=datetime.date(1965, 3, 10),
            gender='M',
            address='F-8/3, Islamabad',
            phone='+923001112233',
            primary_diagnosis='Post-CVA Hemiplegia with Dysphagia',
            allergies='Penicillin',
            is_active=True,
        )

        self.patient_b = Patient.objects.create(
            mr_number='MRN-BETA-002',
            patient_code='PT-BETA',
            first_name='Fatima',
            last_name='Zahra',
            date_of_birth=datetime.date(1972, 7, 22),
            gender='F',
            address='G-10/2, Islamabad',
            phone='+923004445566',
            primary_diagnosis='Type 2 Diabetes Mellitus with Neuropathy',
            allergies='NKDA',
            is_active=True,
        )

        # 1. Doctor A (assigned to Patient A)
        self.doc_user = User.objects.create_user(username='dr_alam', password='TestPassword123!', first_name='Tariq', last_name='Alam')
        self.doc_staff = StaffMember.objects.create(
            user=self.doc_user,
            first_name='Tariq',
            last_name='Alam',
            role=StaffRole.DOCTOR,
            employee_id='DOC-001',
            platform_allowed='both',
            hire_date=datetime.date(2024, 1, 1),
            designation='Consultant Physician',
            specialization='Internal Medicine',
        )

        # 2. Doctor B (non-treating doctor, NOT assigned to Patient A)
        self.doc_b_user = User.objects.create_user(username='dr_other', password='TestPassword123!', first_name='Zafar', last_name='Iqbal')
        self.doc_b_staff = StaffMember.objects.create(
            user=self.doc_b_user,
            first_name='Zafar',
            last_name='Iqbal',
            role=StaffRole.DOCTOR,
            employee_id='DOC-002',
            platform_allowed='both',
            hire_date=datetime.date(2024, 1, 1),
            designation='General Physician',
        )

        # 3. Physiotherapist (assigned to Patient A)
        self.physio_user = User.objects.create_user(username='pt_bilal', password='TestPassword123!', first_name='Bilal', last_name='Khan')
        self.physio_staff = StaffMember.objects.create(
            user=self.physio_user,
            first_name='Bilal',
            last_name='Khan',
            role=StaffRole.PHYSIO,
            employee_id='PT-001',
            platform_allowed='both',
            hire_date=datetime.date(2024, 3, 1),
            designation='Senior Physical Therapist',
            specialization='Neuro-Rehabilitation',
        )

        # 4. Speech Therapist (assigned to Patient A)
        self.speech_user = User.objects.create_user(username='slp_amna', password='TestPassword123!', first_name='Amna', last_name='Saeed')
        self.speech_staff = StaffMember.objects.create(
            user=self.speech_user,
            first_name='Amna',
            last_name='Saeed',
            role=StaffRole.SPEECH,
            employee_id='SLP-001',
            platform_allowed='both',
            hire_date=datetime.date(2024, 4, 1),
            designation='Speech Pathologist',
            specialization='Dysphagia Recovery',
        )

        # 5. Psychotherapist (assigned to Patient A)
        self.psych_user = User.objects.create_user(username='psy_maryam', password='TestPassword123!', first_name='Maryam', last_name='Siddiqui')
        self.psych_staff = StaffMember.objects.create(
            user=self.psych_user,
            first_name='Maryam',
            last_name='Siddiqui',
            role=StaffRole.PSYCHOLOGIST,
            employee_id='PSY-001',
            platform_allowed='both',
            hire_date=datetime.date(2024, 5, 1),
            designation='Clinical Psychologist',
            specialization='Cognitive Behavioral Therapy (CBT)',
        )

        # 6. Nurse (assigned to Patient A)
        self.nurse_user = User.objects.create_user(username='rn_sarah', password='TestPassword123!', first_name='Sarah', last_name='Mitchell')
        self.nurse_staff = StaffMember.objects.create(
            user=self.nurse_user,
            first_name='Sarah',
            last_name='Mitchell',
            role=StaffRole.NURSE,
            employee_id='RN-001',
            platform_allowed='both',
            hire_date=datetime.date(2025, 1, 1),
            designation='Registered Nurse (RN)',
        )

        # 7. Care Manager (assigned to Patient A)
        self.cm_user = User.objects.create_user(username='cm_hina', password='TestPassword123!', first_name='Hina', last_name='Malik')
        self.cm_staff = StaffMember.objects.create(
            user=self.cm_user,
            first_name='Hina',
            last_name='Malik',
            role=StaffRole.CARE_MANAGER,
            employee_id='CM-001',
            platform_allowed='both',
            hire_date=datetime.date(2023, 6, 1),
            designation='Client Care Manager',
        )
        self.patient_a.assigned_care_manager = self.cm_staff
        self.patient_a.save()

        # 8. Unassigned Care Manager (assigned to Patient B only)
        self.cm_b_user = User.objects.create_user(username='cm_unassigned', password='TestPassword123!', first_name='Kamran', last_name='Akmal')
        self.cm_b_staff = StaffMember.objects.create(
            user=self.cm_b_user,
            first_name='Kamran',
            last_name='Akmal',
            role=StaffRole.CARE_MANAGER,
            employee_id='CM-002',
            platform_allowed='both',
            hire_date=datetime.date(2023, 7, 1),
            designation='Care Coordinator',
        )
        self.patient_b.assigned_care_manager = self.cm_b_staff
        self.patient_b.save()

        # 9. Admin and Super Admin users
        self.admin_user = User.objects.create_user(username='sys_admin', password='TestPassword123!', is_staff=True)
        self.super_admin_user = User.objects.create_superuser(username='super_admin_boss', password='TestPassword123!')

        # 10. Platform-allowed test users (mobile-only and web-only doctors)
        self.mobile_doc_user = User.objects.create_user(username='dr_mobile_only', password='TestPassword123!')
        self.mobile_doc_staff = StaffMember.objects.create(
            user=self.mobile_doc_user,
            first_name='Mobile',
            last_name='Doc',
            role=StaffRole.DOCTOR,
            employee_id='DOC-MOB-01',
            platform_allowed='mobile',
            hire_date=datetime.date(2024, 1, 1),
            designation='Field Doctor',
        )
        self.web_doc_user = User.objects.create_user(username='dr_web_only', password='TestPassword123!')
        self.web_doc_staff = StaffMember.objects.create(
            user=self.web_doc_user,
            first_name='Web',
            last_name='Doc',
            role=StaffRole.DOCTOR,
            employee_id='DOC-WEB-01',
            platform_allowed='web',
            hire_date=datetime.date(2024, 1, 1),
            designation='Hospital Doctor',
        )

        # Bookings to assign Clinicians to Patient A
        now = timezone.now()
        Booking.objects.create(
            patient=self.patient_a,
            assigned_staff=self.doc_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=now + datetime.timedelta(hours=2),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )
        Booking.objects.create(
            patient=self.patient_a,
            assigned_staff=self.physio_staff,
            service_type=ServiceType.PHYSIOTHERAPY,
            scheduled_time=now + datetime.timedelta(hours=4),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )
        Booking.objects.create(
            patient=self.patient_a,
            assigned_staff=self.speech_staff,
            service_type=ServiceType.SPEECH_THERAPY,
            scheduled_time=now + datetime.timedelta(hours=6),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )
        Booking.objects.create(
            patient=self.patient_a,
            assigned_staff=self.psych_staff,
            service_type=ServiceType.PSYCHOTHERAPY,
            scheduled_time=now + datetime.timedelta(hours=8),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )
        Booking.objects.create(
            patient=self.patient_a,
            assigned_staff=self.nurse_staff,
            service_type=ServiceType.NURSING,
            scheduled_time=now + datetime.timedelta(hours=1),
            shift_duration=ShiftDuration.TWELVE_HOURS,
            status=BookingStatus.IN_PROGRESS,
        )

        # Patient B has NO bookings with any of the above clinicians (unassigned to all of them)

    # ── Test 1: Each Role Assigned vs Unassigned Patients ─────────────────────

    def test_each_role_assigned_vs_unassigned_get_and_post(self):
        """
        Tests that Doctor, Physio, Speech, Psychotherapist, and Nurse:
        - Receive 200/201 on assigned patient (Patient A)
        - Receive 404 NOT FOUND on unassigned patient (Patient B)
        """
        # 1. Doctor
        self.client.force_authenticate(user=self.doc_user)
        # Assigned Patient A
        res_doc_get = self.client.get(f"/api/patients/{self.patient_a.id}/doctor-notes/")
        self.assertEqual(res_doc_get.status_code, status.HTTP_200_OK)
        res_doc_post = self.client.post(f"/api/patients/{self.patient_a.id}/doctor-notes/", {
            'notes': 'Cardiovascular and neurological clinical assessment.',
            'plan': 'Continue daily antihypertensive medications and neuro-rehab.',
        })
        self.assertEqual(res_doc_post.status_code, status.HTTP_201_CREATED)

        # Unassigned Patient B -> 404
        res_doc_cross_get = self.client.get(f"/api/patients/{self.patient_b.id}/doctor-notes/")
        self.assertEqual(res_doc_cross_get.status_code, status.HTTP_404_NOT_FOUND)
        res_doc_cross_post = self.client.post(f"/api/patients/{self.patient_b.id}/doctor-notes/", {
            'notes': 'Attempting note on unassigned patient.',
        })
        self.assertEqual(res_doc_cross_post.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Physiotherapist
        self.client.force_authenticate(user=self.physio_user)
        res_pt_get = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_pt_get.status_code, status.HTTP_200_OK)
        res_pt_post = self.client.post(f"/api/patients/{self.patient_a.id}/therapy-notes/", {
            'discipline': 'physiotherapy',
            'session_notes': 'Passive ROM and gait retraining exercises performed.',
            'plan': 'Quadriceps strengthening 3 sets daily.',
        })
        self.assertEqual(res_pt_post.status_code, status.HTTP_201_CREATED)

        # Unassigned Patient B -> 404
        res_pt_cross_get = self.client.get(f"/api/patients/{self.patient_b.id}/therapy-notes/")
        self.assertEqual(res_pt_cross_get.status_code, status.HTTP_404_NOT_FOUND)
        res_pt_cross_post = self.client.post(f"/api/patients/{self.patient_b.id}/therapy-notes/", {
            'session_notes': 'Unassigned therapy attempt.',
        })
        self.assertEqual(res_pt_cross_post.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Speech Therapist
        self.client.force_authenticate(user=self.speech_user)
        res_slp_get = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_slp_get.status_code, status.HTTP_200_OK)
        res_slp_post = self.client.post(f"/api/patients/{self.patient_a.id}/therapy-notes/", {
            'discipline': 'speech_therapy',
            'session_notes': 'Dysphagia swallow reflex evaluation: chin-tuck posture training.',
            'plan': 'Nectar-thickened fluids diet.',
        })
        self.assertEqual(res_slp_post.status_code, status.HTTP_201_CREATED)

        # Unassigned Patient B -> 404
        res_slp_cross = self.client.get(f"/api/patients/{self.patient_b.id}/therapy-notes/")
        self.assertEqual(res_slp_cross.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Psychotherapist
        self.client.force_authenticate(user=self.psych_user)
        res_psy_get = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_psy_get.status_code, status.HTTP_200_OK)
        res_psy_post = self.client.post(f"/api/patients/{self.patient_a.id}/therapy-notes/", {
            'discipline': 'psychotherapy',
            'session_notes': 'CBT Session 1: Patient adjustment to post-stroke motor limitations.',
            'plan': 'Mindfulness breathing and cognitive reframing.',
        })
        self.assertEqual(res_psy_post.status_code, status.HTTP_201_CREATED)

        # Unassigned Patient B -> 404
        res_psy_cross = self.client.get(f"/api/patients/{self.patient_b.id}/therapy-notes/")
        self.assertEqual(res_psy_cross.status_code, status.HTTP_404_NOT_FOUND)

        # 5. Nurse
        self.client.force_authenticate(user=self.nurse_user)
        res_rn_get = self.client.get(f"/api/patients/{self.patient_a.id}/notes/")
        self.assertEqual(res_rn_get.status_code, status.HTTP_200_OK)
        res_rn_post = self.client.post(f"/api/patients/{self.patient_a.id}/nurse_notes/", {
            'note': 'Bedside morning observation: vitals stable, patient alert and oriented.',
        })
        self.assertEqual(res_rn_post.status_code, status.HTTP_201_CREATED)

        # Unassigned Patient B -> 404
        res_rn_cross_get = self.client.get(f"/api/patients/{self.patient_b.id}/notes/")
        self.assertEqual(res_rn_cross_get.status_code, status.HTTP_404_NOT_FOUND)

    # ── Test 2: Psychotherapist Notes Confidentiality Rule ───────────────────

    def test_psychotherapist_notes_confidentiality_rule(self):
        """
        Psychotherapist notes are visible ONLY to:
          1. The author psychotherapist
          2. The patient's treating doctor (Dr. Alam)
          3. The care manager (Hina Malik)
        STRICTLY HIDDEN (filtered out / 404) from:
          - Nurse (Sarah Mitchell)
          - Physiotherapist (Bilal Khan)
          - Doctor NOT treating (Dr. Zafar Iqbal)
        """
        # Create a psychotherapy note by Maryam Siddiqui
        psy_note = TherapyNote.objects.create(
            patient=self.patient_a,
            author=self.psych_staff,
            discipline='psychotherapy',
            session_notes='Confidential psychotherapy assessment: coping mechanism evaluation.',
            plan='Continue individual sessions.',
        )

        # 1. Author (Psychotherapist) can view
        self.client.force_authenticate(user=self.psych_user)
        res_auth = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_auth.status_code, status.HTTP_200_OK)
        ids_auth = [n['id'] for n in res_auth.data]
        self.assertIn(psy_note.id, ids_auth)

        # 2. Treating Doctor (Dr. Alam) can view
        self.client.force_authenticate(user=self.doc_user)
        res_doc = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_doc.status_code, status.HTTP_200_OK)
        ids_doc = [n['id'] for n in res_doc.data]
        self.assertIn(psy_note.id, ids_doc)

        # 3. Care Manager (Hina Malik) can view
        self.client.force_authenticate(user=self.cm_user)
        res_cm = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_cm.status_code, status.HTTP_200_OK)
        ids_cm = [n['id'] for n in res_cm.data]
        self.assertIn(psy_note.id, ids_cm)

        # 4. Nurse (Sarah Mitchell) CANNOT view psychotherapy note (filtered out)
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_nurse.status_code, status.HTTP_200_OK)
        ids_nurse = [n['id'] for n in res_nurse.data]
        self.assertNotIn(psy_note.id, ids_nurse)
        # Direct object access returns 404
        res_nurse_detail = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/{psy_note.id}/")
        self.assertEqual(res_nurse_detail.status_code, status.HTTP_404_NOT_FOUND)

        # 5. Physiotherapist (Bilal Khan) CANNOT view psychotherapy note
        self.client.force_authenticate(user=self.physio_user)
        res_pt = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_pt.status_code, status.HTTP_200_OK)
        ids_pt = [n['id'] for n in res_pt.data]
        self.assertNotIn(psy_note.id, ids_pt)
        res_pt_detail = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/{psy_note.id}/")
        self.assertEqual(res_pt_detail.status_code, status.HTTP_404_NOT_FOUND)

        # 6. Doctor NOT treating (Dr. Zafar Iqbal) CANNOT view psychotherapy note
        # Assign Dr. Iqbal to Patient B so he has valid login, but not Patient A
        self.client.force_authenticate(user=self.doc_b_user)
        res_doc_b_detail = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/{psy_note.id}/")
        self.assertEqual(res_doc_b_detail.status_code, status.HTTP_404_NOT_FOUND)

        # 7. Unassigned Care Manager (Kamran Akmal, CM for Patient B) CANNOT view psychotherapy note
        self.client.force_authenticate(user=self.cm_b_user)
        res_cm_b = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_cm_b.status_code, status.HTTP_200_OK)
        ids_cm_b = [n['id'] for n in res_cm_b.data]
        self.assertNotIn(psy_note.id, ids_cm_b)
        res_cm_b_detail = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/{psy_note.id}/")
        self.assertEqual(res_cm_b_detail.status_code, status.HTTP_404_NOT_FOUND)

        # 8. System Admin (sys_admin) CAN view psychotherapy note (regulatory/compliance oversight)
        self.client.force_authenticate(user=self.admin_user)
        res_adm = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_adm.status_code, status.HTTP_200_OK)
        ids_adm = [n['id'] for n in res_adm.data]
        self.assertIn(psy_note.id, ids_adm)

        # 9. Super Admin (super_admin_boss) CAN view psychotherapy note
        self.client.force_authenticate(user=self.super_admin_user)
        res_super = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_super.status_code, status.HTTP_200_OK)
        ids_super = [n['id'] for n in res_super.data]
        self.assertIn(psy_note.id, ids_super)

    # ── Test 3: Immutable Clinical Entries & Addendum Rule ────────────────────

    def test_immutable_clinical_entries_rule(self):
        """
        Phase 1 Immutability Enforcement:
        1. Once signed, a clinical entry is permanently locked.
        2. Direct edits (PUT/PATCH) are rejected (400 Bad Request via API).
        3. Direct DELETE on signed entry is rejected (400 Bad Request via API).
        4. Model save() and delete() reject changes to signed rows (raising ValidationError).
        5. Cannot un-sign (is_signed=False raises ValidationError).
        6. Addenda history can only grow, never be modified or removed.
        7. Django admin has_delete_permission returns False for signed entries.
        Tested across DoctorNote, PhysioNote, TherapyNote, and ClinicalConsent.
        """
        self.client.force_authenticate(user=self.doc_user)

        # 1. Create a note and digitally sign it
        res_create = self.client.post(f"/api/patients/{self.patient_a.id}/doctor-notes/", {
            'notes': 'Initial physician evaluation: blood pressure 130/80 mmHg, alert.',
            'plan': 'Monitor vitals twice daily.',
            'is_signed': True,
        })
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        note_id = res_create.data['id']
        self.assertTrue(res_create.data['is_signed'])

        # 2. Doctor attempts direct edit on signed note -> REJECTED (400 Bad Request)
        res_edit = self.client.patch(f"/api/patients/{self.patient_a.id}/doctor-notes/{note_id}/", {
            'notes': 'Attempting retroactive change to signed entry text.',
        })
        self.assertEqual(res_edit.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('immutable', res_edit.data['error'].lower())

        # 3. Doctor attempts DELETE on signed note -> REJECTED (400 Bad Request)
        res_del = self.client.delete(f"/api/patients/{self.patient_a.id}/doctor-notes/{note_id}/")
        self.assertEqual(res_del.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('locked', res_del.data['error'].lower())

        # 4. Model-level save() protection: direct mutation raises ValidationError
        note_db = DoctorNote.objects.get(pk=note_id)
        note_db.notes = "Bypassing serializer to modify database directly"
        with self.assertRaises(ValidationError):
            note_db.save()

        # 5. Model-level delete() protection: delete() on signed instance raises ValidationError
        note_db.refresh_from_db()
        with self.assertRaises(ValidationError):
            note_db.delete()

        # 6. Cannot un-sign: setting is_signed = False raises ValidationError
        note_db.refresh_from_db()
        note_db.is_signed = False
        with self.assertRaises(ValidationError):
            note_db.save()

        # 7. Model-level enforcement across PhysioNote, TherapyNote, and ClinicalConsent
        physio_note = PhysioNote.objects.create(
            patient=self.patient_a,
            physio=self.physio_staff,
            session_notes="Initial mobility evaluation: ambulatory with walker.",
            is_signed=True,
            signed_at=timezone.now(),
        )
        physio_note.session_notes = "Tampered physio notes"
        with self.assertRaises(ValidationError):
            physio_note.save()
        with self.assertRaises(ValidationError):
            physio_note.delete()

        therapy_note = TherapyNote.objects.create(
            patient=self.patient_a,
            author=self.speech_staff,
            discipline='speech_therapy',
            session_notes="Swallow evaluation: pureed diet recommended.",
            is_signed=True,
            signed_at=timezone.now(),
        )
        therapy_note.session_notes = "Tampered SLP assessment"
        with self.assertRaises(ValidationError):
            therapy_note.save()
        with self.assertRaises(ValidationError):
            therapy_note.delete()

        consent = ClinicalConsent.objects.create(
            patient=self.patient_a,
            title="General Homecare Consent",
            granted_by="Patient",
            is_signed=True,
            signed_at=timezone.now(),
        )
        consent.title = "Tampered Consent Title"
        with self.assertRaises(ValidationError):
            consent.save()
        with self.assertRaises(ValidationError):
            consent.delete()

        # 8. Addenda list can ONLY grow (new addendum appended)
        note_db.refresh_from_db()
        new_addendum = {
            'author': 'Dr. Tariq Alam',
            'role': 'doctor',
            'reason': 'Follow-up vitals verification',
            'text': 'Evening BP stabilized at 120/78 mmHg.',
            'timestamp': timezone.now().isoformat(),
        }
        note_db.addenda.append(new_addendum)
        note_db.save()  # Succeeded because addenda only grew!

        # Now attempt to remove or edit an existing addendum -> ValidationError
        note_db.refresh_from_db()
        note_db.addenda = []  # Truncated
        with self.assertRaises(ValidationError):
            note_db.save()

        note_db.refresh_from_db()
        note_db.addenda[0]['text'] = "Tampered addendum text"
        with self.assertRaises(ValidationError):
            note_db.save()

        # 9. Django Admin enforcement: has_delete_permission returns False for signed rows
        rf = RequestFactory()
        admin_req = rf.get('/admin/')
        admin_req.user = self.super_admin_user
        doc_note_admin = admin.site._registry[DoctorNote]
        self.assertFalse(doc_note_admin.has_delete_permission(admin_req, obj=note_db))

    # ── Test 4: Addendum Rights ───────────────────────────────────────────────

    def test_addendum_rights(self):
        """
        Addendum Rights Rule:
        Permitted ONLY to:
          1. The original author
          2. The patient's assigned treating doctor
          3. The patient's assigned care manager
        All others (another doctor, nurse, unassigned clinician) get 403 or 404.
        """
        # Create a signed therapy note authored by speech therapist Amna
        note = TherapyNote.objects.create(
            patient=self.patient_a,
            author=self.speech_staff,
            discipline='speech_therapy',
            session_notes="Initial speech assessment: mild dysarthria.",
            is_signed=True,
            signed_at=timezone.now(),
        )

        # 1. Original author (Speech Therapist Amna) -> ALLOWED (200)
        self.client.force_authenticate(user=self.speech_user)
        res_auth = self.client.post(f"/api/patients/{self.patient_a.id}/therapy-notes/{note.id}/addendum/", {
            'text': 'Speech addendum: vocal exercises tolerated well.',
            'reason': 'Session follow-up note.',
        })
        self.assertEqual(res_auth.status_code, status.HTTP_200_OK)

        # 2. Patient's assigned Treating Doctor (Dr. Tariq Alam) -> ALLOWED (200)
        self.client.force_authenticate(user=self.doc_user)
        res_doc = self.client.post(f"/api/patients/{self.patient_a.id}/therapy-notes/{note.id}/addendum/", {
            'text': 'Physician addendum: confirmed neurology follow-up plan.',
            'reason': 'Clinical coordination review.',
        })
        self.assertEqual(res_doc.status_code, status.HTTP_200_OK)

        # 3. Patient's assigned Care Manager (Hina Malik) -> ALLOWED (200)
        self.client.force_authenticate(user=self.cm_user)
        res_cm = self.client.post(f"/api/patients/{self.patient_a.id}/therapy-notes/{note.id}/addendum/", {
            'text': 'Care manager addendum: coordinated next SLP visit schedule.',
            'reason': 'Care plan alignment.',
        })
        self.assertEqual(res_cm.status_code, status.HTTP_200_OK)

        # 4. Nurse (Sarah Mitchell) -> DENIED (403 Forbidden)
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse = self.client.post(f"/api/patients/{self.patient_a.id}/therapy-notes/{note.id}/addendum/", {
            'text': 'Nurse addendum attempt.',
            'reason': 'Bedside check.',
        })
        self.assertEqual(res_nurse.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Non-treating doctor (Dr. Zafar Iqbal) -> 404 (Unassigned to Patient A)
        self.client.force_authenticate(user=self.doc_b_user)
        res_other_doc = self.client.post(f"/api/patients/{self.patient_a.id}/therapy-notes/{note.id}/addendum/", {
            'text': 'Unassigned physician addendum attempt.',
            'reason': 'Unauthorized review.',
        })
        self.assertEqual(res_other_doc.status_code, status.HTTP_404_NOT_FOUND)

        # 6. Unassigned Care Manager (Kamran Akmal, CM for Patient B) -> 403 Forbidden
        self.client.force_authenticate(user=self.cm_b_user)
        res_cm_b = self.client.post(f"/api/patients/{self.patient_a.id}/therapy-notes/{note.id}/addendum/", {
            'text': 'Unassigned CM addendum attempt.',
            'reason': 'Cross-patient review.',
        })
        self.assertEqual(res_cm_b.status_code, status.HTTP_403_FORBIDDEN)

    # ── Test 5: Platform Allowed Enforcement (Web vs Mobile with Header) ──────

    def test_platform_allowed_access(self):
        """
        platform_allowed and X-Client-Platform header verification:
        - Clinician with platform_allowed = 'mobile' attempting web login -> 400 (mobile_only)
        - Clinician with platform_allowed = 'mobile' on web (no header or web header) -> 403 (mobile_only)
        - Clinician with platform_allowed = 'mobile' with X-Client-Platform='mobile' -> 200 OK
        - Clinician with platform_allowed = 'web' attempting mobile login -> 400 (web_only)
        - Clinician with platform_allowed = 'web' with X-Client-Platform='mobile' -> 403 (web_only)
        - Clinician with platform_allowed = 'web' on web (no header or web header) -> 200 OK
        """
        # 1. Doctor configured for mobile-only tries web login
        res_mob_web = self.client.post('/api/auth/login/', {
            'username': 'dr_mobile_only',
            'password': 'TestPassword123!',
            'platform': 'web',
        })
        self.assertEqual(res_mob_web.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('mobile_only', str(res_mob_web.data))

        # 2. Doctor configured for mobile-only calls clinician-home without mobile header -> 403
        self.client.force_authenticate(user=self.mobile_doc_user)
        res_mob_home_web = self.client.get('/api/staff-portal/clinician-home/')
        self.assertEqual(res_mob_home_web.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_mob_home_web.data.get('error'), 'mobile_only')

        # 3. Doctor configured for mobile-only calls clinician-home WITH X-Client-Platform: 'mobile' -> 200 OK
        res_mob_home_mob = self.client.get('/api/staff-portal/clinician-home/', HTTP_X_CLIENT_PLATFORM='mobile')
        self.assertEqual(res_mob_home_mob.status_code, status.HTTP_200_OK)

        # 4. Doctor configured for web-only tries mobile login -> 400
        self.client.logout()
        res_web_mob = self.client.post('/api/auth/login/', {
            'username': 'dr_web_only',
            'password': 'TestPassword123!',
            'platform': 'mobile',
        })
        self.assertEqual(res_web_mob.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('web_only', str(res_web_mob.data))

        # 5. Doctor configured for web-only calls clinician-home WITH X-Client-Platform: 'mobile' -> 403 Forbidden
        self.client.force_authenticate(user=self.web_doc_user)
        res_web_home_mob = self.client.get('/api/staff-portal/clinician-home/', HTTP_X_CLIENT_PLATFORM='mobile')
        self.assertEqual(res_web_home_mob.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_web_home_mob.data.get('error'), 'web_only')

        # 6. Doctor configured for web-only calls clinician-home on web -> 200 OK
        res_web_home = self.client.get('/api/staff-portal/clinician-home/')
        self.assertEqual(res_web_home.status_code, status.HTTP_200_OK)

    # ── Test 6: Chart Audit Logging (No PHI in Logs) ──────────────────────────

    def test_chart_audit_logging_and_no_phi_in_logs(self):
        """
        Every read or write of a patient chart creates an AuditLog entry.
        AuditLog contains NO patient PHI (no names, vitals, diagnoses or notes).
        """
        AuditLog.objects.all().delete()
        self.client.force_authenticate(user=self.doc_user)

        # Read chart
        self.client.get(f"/api/patients/{self.patient_a.id}/doctor-notes/")
        self.assertTrue(AuditLog.objects.filter(action='Read Patient Record').exists())

        # Write chart
        self.client.post(f"/api/patients/{self.patient_a.id}/doctor-notes/", {
            'notes': 'Clinical review notes for audit test.',
            'plan': 'Routine care.',
        })
        self.assertTrue(AuditLog.objects.filter(action='Write Clinical Entry').exists())

        # Inspect all audit logs created: verify NO PHI
        for log in AuditLog.objects.all():
            # Target should only be patient code/ID, not patient plaintext name or clinical data
            self.assertNotIn('Ahmed', log.target_user)
            self.assertNotIn('Khan', log.target_user)
            self.assertNotIn('Hemiplegia', log.details)
            self.assertNotIn('Dysphagia', log.details)
            self.assertNotIn('Penicillin', log.details)

    # ── Test 7: Clinician Home Dashboard Endpoint ─────────────────────────────

    def test_clinician_home_dashboard_endpoint(self):
        """
        Validates GET /api/staff-portal/clinician-home/ for doctor, physio, speech, psychotherapist.
        Returns working hours from settings, visits table, high alert grouping, quick links.
        """
        self.client.force_authenticate(user=self.doc_user)
        res = self.client.get('/api/staff-portal/clinician-home/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data
        self.assertIn('staff', data)
        self.assertEqual(data['staff']['employee_id'], 'DOC-001')
        self.assertEqual(data['staff']['designation'], 'Consultant Physician')

        self.assertIn('working_hours', data)
        self.assertEqual(data['working_hours']['start'], '09:00')
        self.assertEqual(data['working_hours']['end'], '17:00')

        self.assertIn('today_visits', data)
        self.assertIn('high_alert_patients', data)
        self.assertIn('critical', data['high_alert_patients'])
        self.assertIn('less_critical', data['high_alert_patients'])
        self.assertIn('mild', data['high_alert_patients'])
        self.assertIn('unclassified', data['high_alert_patients'])
        self.assertIn('no_recent_vitals', data['high_alert_patients'])
        self.assertIn('stable', data['high_alert_patients'])
        self.assertIn('provisional_note', data)

        self.assertIn('placeholders', data)
        placeholders = {p['title']: p['status'] for p in data['placeholders']}
        self.assertEqual(placeholders.get('Online consultation (audio, video)'), 'Coming soon')
        self.assertEqual(placeholders.get('AI Assistant'), 'Coming soon')

    # ── Test 8: High-Alert Unclassified & No Recent Vitals Safety ──────────────

    def test_high_alert_unclassified_and_no_recent_vitals_safety(self):
        """
        Safety requirements:
        - Blood glucose 400 mg/dL -> unclassified ("Needs review"), NEVER stable.
        - Diastolic BP 130 mmHg -> unclassified ("Needs review"), NEVER stable.
        - Hypothermia (34.0°C) -> unclassified ("Needs review"), NEVER stable.
        - No vitals logged within recent window (24h) -> no_recent_vitals ("No recent vitals"), NEVER stable.
        - Fully normal vitals (sys 120, dia 80, hr 72, spo2 98, temp 36.6, bg 100) -> stable.
        - alert_thresholds_used dynamically generated from settings constants.
        """
        # Create test patients assigned to treating doctor Dr. Tariq Alam
        now = timezone.now()

        # Patient 1: Blood Glucose 400 mg/dL (severe hyperglycemia with no acute tier bracket)
        p_glucose = Patient.objects.create(
            mr_number='MRN-GLU-001',
            first_name='Glucose',
            last_name='Patient',
            date_of_birth=datetime.date(1980, 1, 1),
            is_active=True,
        )
        Booking.objects.create(
            patient=p_glucose,
            assigned_staff=self.doc_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=now + datetime.timedelta(hours=1),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )
        VitalSign.objects.create(
            patient=p_glucose,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=75,
            temperature=36.8,
            spo2=98,
            blood_glucose=400,
            recorded_at=now - datetime.timedelta(hours=1),
        )

        # Patient 2: Diastolic BP 130 mmHg (isolated severe diastolic elevation with no tier bracket)
        p_diastolic = Patient.objects.create(
            mr_number='MRN-DIA-002',
            first_name='Diastolic',
            last_name='Patient',
            date_of_birth=datetime.date(1982, 2, 2),
            is_active=True,
        )
        Booking.objects.create(
            patient=p_diastolic,
            assigned_staff=self.doc_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=now + datetime.timedelta(hours=2),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )
        VitalSign.objects.create(
            patient=p_diastolic,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=130,
            heart_rate=75,
            temperature=36.8,
            spo2=98,
            blood_glucose=100,
            recorded_at=now - datetime.timedelta(hours=1),
        )

        # Patient 3: Hypothermia (temp 34.0°C < 35.5°C baseline normal)
        p_hypo = Patient.objects.create(
            mr_number='MRN-HYPO-003',
            first_name='Hypo',
            last_name='Patient',
            date_of_birth=datetime.date(1984, 3, 3),
            is_active=True,
        )
        Booking.objects.create(
            patient=p_hypo,
            assigned_staff=self.doc_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=now + datetime.timedelta(hours=3),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )
        VitalSign.objects.create(
            patient=p_hypo,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=70,
            temperature=34.0,
            spo2=98,
            blood_glucose=100,
            recorded_at=now - datetime.timedelta(hours=1),
        )

        # Patient 4: No vitals recorded within 24h (recorded 48 hours ago)
        p_novitals = Patient.objects.create(
            mr_number='MRN-NOVI-004',
            first_name='Stale',
            last_name='Patient',
            date_of_birth=datetime.date(1986, 4, 4),
            is_active=True,
        )
        Booking.objects.create(
            patient=p_novitals,
            assigned_staff=self.doc_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=now + datetime.timedelta(hours=4),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )
        VitalSign.objects.create(
            patient=p_novitals,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=75,
            temperature=36.8,
            spo2=98,
            blood_glucose=100,
            recorded_at=now - datetime.timedelta(hours=48),
        )

        # Patient 5: Fully normal vitals
        p_normal = Patient.objects.create(
            mr_number='MRN-NORM-005',
            first_name='Stable',
            last_name='Patient',
            date_of_birth=datetime.date(1988, 5, 5),
            is_active=True,
        )
        Booking.objects.create(
            patient=p_normal,
            assigned_staff=self.doc_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=now + datetime.timedelta(hours=5),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )
        VitalSign.objects.create(
            patient=p_normal,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=72,
            temperature=36.6,
            spo2=98,
            blood_glucose=100,
            recorded_at=now - datetime.timedelta(hours=2),
        )

        self.client.force_authenticate(user=self.doc_user)
        res = self.client.get('/api/staff-portal/clinician-home/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        groups = res.data['high_alert_patients']
        unclassified_ids = [p['patient_id'] for p in groups['unclassified']]
        no_recent_ids = [p['patient_id'] for p in groups['no_recent_vitals']]
        stable_ids = [p['patient_id'] for p in groups['stable']]

        # Assertions
        self.assertIn(p_glucose.id, unclassified_ids)
        self.assertNotIn(p_glucose.id, stable_ids)

        self.assertIn(p_diastolic.id, unclassified_ids)
        self.assertNotIn(p_diastolic.id, stable_ids)

        self.assertIn(p_hypo.id, unclassified_ids)
        self.assertNotIn(p_hypo.id, stable_ids)

        self.assertIn(p_novitals.id, no_recent_ids)
        self.assertNotIn(p_novitals.id, stable_ids)

        self.assertIn(p_normal.id, stable_ids)

        # Verify dynamic alert_thresholds_used strings
        th_used = res.data['alert_thresholds_used']
        self.assertIn('critical', th_used)
        self.assertIn('unclassified', th_used)
        self.assertIn('no_recent_vitals', th_used)
        self.assertEqual(res.data['provisional_note'], 'PROVISIONAL - needs clinical sign-off')

    # ── Test 9: Treating Doctor Time Window Scoping ───────────────────────────

    def test_treating_doctor_time_window_scoping(self):
        """
        is_treating_doctor_for_patient enforces time window:
        - Doctor with a booking completed 15 days ago (> CLINICIAN_PATIENT_ACCESS_DAYS_AFTER_VISIT)
          is NO LONGER a treating doctor:
          - Cannot read psychotherapy notes (404 Not Found)
          - Cannot add an addendum (404 Not Found)
        - Doctor with a recent booking 2 days ago (< CLINICIAN_PATIENT_ACCESS_DAYS_AFTER_VISIT):
          - Can read psychotherapy notes (200 OK)
          - Can add an addendum (200 OK)
        """
        now = timezone.now()

        # Doctor C with an old booking for Patient B completed 15 days ago
        doc_c_user = User.objects.create_user(username='dr_old_booking', password='TestPassword123!')
        doc_c_staff = StaffMember.objects.create(
            user=doc_c_user,
            first_name='Old',
            last_name='Doc',
            role=StaffRole.DOCTOR,
            employee_id='DOC-OLD-01',
            platform_allowed='both',
            hire_date=datetime.date(2024, 1, 1),
            designation='Specialist',
        )
        Booking.objects.create(
            patient=self.patient_b,
            assigned_staff=doc_c_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=now - datetime.timedelta(days=15),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.COMPLETED,
        )

        # Create psychotherapy note for Patient B
        psy_note = TherapyNote.objects.create(
            patient=self.patient_b,
            author=self.psych_staff,
            discipline='psychotherapy',
            session_notes='Confidential psychotherapy evaluation.',
            is_signed=True,
            signed_at=now,
        )

        # Doctor C tries to read psychotherapy note of Patient B -> 404 (Out of access window)
        self.client.force_authenticate(user=doc_c_user)
        res_read_old = self.client.get(f"/api/patients/{self.patient_b.id}/therapy-notes/{psy_note.id}/")
        self.assertEqual(res_read_old.status_code, status.HTTP_404_NOT_FOUND)

        # Doctor C tries to add addendum to Patient B's note -> 404 (Not treating doctor)
        res_add_old = self.client.post(f"/api/patients/{self.patient_b.id}/therapy-notes/{psy_note.id}/addendum/", {
            'text': 'Late addendum attempt.',
            'reason': 'Follow up.',
        })
        self.assertEqual(res_add_old.status_code, status.HTTP_404_NOT_FOUND)

        # Now give Doctor C a recent booking 2 days ago for Patient B
        Booking.objects.create(
            patient=self.patient_b,
            assigned_staff=doc_c_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=now - datetime.timedelta(days=2),
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.COMPLETED,
        )

        # Doctor C can now read psychotherapy note -> 200 OK
        res_read_recent = self.client.get(f"/api/patients/{self.patient_b.id}/therapy-notes/{psy_note.id}/")
        self.assertEqual(res_read_recent.status_code, status.HTTP_200_OK)

        # Doctor C can now add addendum -> 200 OK
        res_add_recent = self.client.post(f"/api/patients/{self.patient_b.id}/therapy-notes/{psy_note.id}/addendum/", {
            'text': 'Doctor review addendum within active clinical window.',
            'reason': 'Active clinical care.',
        })
        self.assertEqual(res_add_recent.status_code, status.HTTP_200_OK)

    # ── Test 10: Sub-resource DELETE Permissions ──────────────────────────────

    def test_subresource_delete_permissions(self):
        """
        Verify DELETE authorization on sub-resources:
        - Nurse attempting to DELETE a DoctorNote -> 403 Forbidden.
        - Doctor attempting to DELETE a TherapyNote -> 403 Forbidden.
        - Non-admin user attempting to DELETE a Patient -> 403 Forbidden (CanDeletePatient).
        """
        # Unsigned doctor note
        doc_note = DoctorNote.objects.create(
            patient=self.patient_a,
            doctor=self.doc_staff,
            notes='Unsigned draft assessment.',
            is_signed=False,
        )
        # Unsigned therapy note
        therapy_note = TherapyNote.objects.create(
            patient=self.patient_a,
            author=self.physio_staff,
            discipline='physiotherapy',
            session_notes='Unsigned draft physio session.',
            is_signed=False,
        )

        # 1. Nurse attempts to DELETE doctor note -> 403 Forbidden
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse_del = self.client.delete(f"/api/patients/{self.patient_a.id}/doctor-notes/{doc_note.id}/")
        self.assertEqual(res_nurse_del.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Doctor attempts to DELETE therapy note -> 403 Forbidden
        self.client.force_authenticate(user=self.doc_user)
        res_doc_del = self.client.delete(f"/api/patients/{self.patient_a.id}/therapy-notes/{therapy_note.id}/")
        self.assertEqual(res_doc_del.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Doctor attempts to DELETE Patient record -> 403 Forbidden (CanDeletePatient)
        res_pt_del = self.client.delete(f"/api/patients/{self.patient_a.id}/")
        self.assertEqual(res_pt_del.status_code, status.HTTP_403_FORBIDDEN)

    # ── Test 11: Karachi Timezone Visit Times ─────────────────────────────────

    def test_karachi_timezone_visit_times(self):
        """
        Visit times in today_visits are formatted in Asia/Karachi (UTC+5).
        A visit scheduled for 10:00 AM PKT appears as '10:00'.
        """
        try:
            from zoneinfo import ZoneInfo
            pkt = ZoneInfo('Asia/Karachi')
        except Exception:
            import pytz
            pkt = pytz.timezone('Asia/Karachi')

        # Schedule booking for 10:00 AM today in Asia/Karachi
        now_pkt = timezone.now().astimezone(pkt)
        scheduled_pkt = now_pkt.replace(hour=10, minute=0, second=0, microsecond=0)

        Booking.objects.create(
            patient=self.patient_a,
            assigned_staff=self.doc_staff,
            service_type=ServiceType.DOCTOR_CONSULTATION,
            scheduled_time=scheduled_pkt,
            shift_duration=ShiftDuration.FOUR_HOURS,
            status=BookingStatus.ASSIGNED,
        )

        self.client.force_authenticate(user=self.doc_user)
        res = self.client.get('/api/staff-portal/clinician-home/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        visits = res.data['today_visits']
        visit_10am = next((v for v in visits if v['patient_id'] == self.patient_a.id and v['visit_time'] == '10:00'), None)
        self.assertIsNotNone(visit_10am, "Expected a visit with visit_time '10:00' formatted in Asia/Karachi")

    # ── Test 12: Psychotherapy Read Non-Author Audit Logging ──────────────────

    def test_psychotherapy_read_audit_log_by_non_author(self):
        """
        Every read of psychotherapy notes by a non-author (Admin, Treating Doctor, Care Manager)
        creates an AuditLog entry with:
          - actor (User)
          - role
          - patient id
          - note ids
          - timestamp
          - NO note content (session_notes, thoughts)
        When author reads own note, non-author confidential access log is NOT created.
        """
        AuditLog.objects.all().delete()

        psy_note = TherapyNote.objects.create(
            patient=self.patient_a,
            author=self.psych_staff,
            discipline='psychotherapy',
            session_notes='Confidential patient psychotherapy trauma notes - TOP SECRET CONTENT.',
            is_signed=True,
            signed_at=timezone.now(),
        )

        # 1. System Admin reads psychotherapy notes list
        self.client.force_authenticate(user=self.super_admin_user)
        res_admin = self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)

        admin_logs = AuditLog.objects.filter(action='Read Psychotherapy Notes', actor=self.super_admin_user)
        self.assertTrue(admin_logs.exists())
        log_entry = admin_logs.first()
        self.assertIn(str(self.patient_a.id), log_entry.details)
        self.assertIn(str(psy_note.id), log_entry.details)
        # Verify strict privacy: NO note content in details
        self.assertNotIn('trauma', log_entry.details)
        self.assertNotIn('SECRET', log_entry.details)

        # 2. System Admin reads single psychotherapy note detail
        self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/{psy_note.id}/")
        detail_logs = AuditLog.objects.filter(action='Read Psychotherapy Note', actor=self.super_admin_user)
        self.assertTrue(detail_logs.exists())
        self.assertNotIn('trauma', detail_logs.first().details)

        # 3. Author (Maryam) reads her own note -> standard chart audit logged, but NO non-author confidential access log
        count_before = AuditLog.objects.filter(action__in=['Read Psychotherapy Notes', 'Read Psychotherapy Note'], actor=self.psych_user).count()
        self.client.force_authenticate(user=self.psych_user)
        self.client.get(f"/api/patients/{self.patient_a.id}/therapy-notes/{psy_note.id}/")
        count_after = AuditLog.objects.filter(action__in=['Read Psychotherapy Notes', 'Read Psychotherapy Note'], actor=self.psych_user).count()
        self.assertEqual(count_before, count_after, "Author reading own note should not trigger non-author confidentiality access log")

