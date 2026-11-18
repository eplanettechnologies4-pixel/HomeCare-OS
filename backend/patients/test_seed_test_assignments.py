"""
Tests for seed_test_assignments management command.
Validates:
1. Command refuses execution without --confirm (dry-run).
2. Creates three fake patients (A, B, C) and proper clinician assignments.
3. Running twice is idempotent and creates no duplicate rows.
4. Nurse sees A, and not B or C.
5. Doctor sees A only (including treating doctor time-window scoping).
6. Speech, psych, and dietician see B only.
7. Manager sees A and B (is_care_manager_for_patient is True for A and B, False for C).
8. Family sees A only (portal_user linked to A; 403 on B and C).
9. Nobody except admin roles sees C (404/403 for non-admins; 200 for admin/super_admin).
10. No clinical rows are created (zero vitals, notes, prescriptions, MAR, labs).
11. --list option prints accessibility table without changing database state.
"""
import io
from django.test import TestCase
from django.core.management import call_command
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from staff.models import StaffMember
from patients.models import (
    Patient, Prescription, VitalSign, NurseNote, DoctorNote,
    PhysioNote, TherapyNote, ClinicalConsent, LabResult, MARAdministration
)
from lab.models import LabOrder, LabReport
from bookings.models import Booking
from patients.scoping import (
    get_assigned_patient_ids_for_clinician,
    is_treating_doctor_for_patient,
    is_care_manager_for_patient,
)

User = get_user_model()


class SeedTestAssignmentsCommandTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_command_refuses_without_confirm(self):
        """Management command must refuse execution and make 0 DB changes without --confirm."""
        out = io.StringIO()
        call_command('seed_test_assignments', stdout=out)
        output = out.getvalue()

        self.assertIn("[DRY RUN]", output)
        self.assertIn("Run with '--confirm' to apply these changes", output)
        # Ensure no test patients were created
        self.assertEqual(Patient.objects.filter(mr_number__startswith='TEST-').count(), 0)

    def test_creates_three_patients_and_assignments(self):
        """Management command with --confirm creates Patients A, B, C and correct bookings/links."""
        out = io.StringIO()
        call_command('seed_test_assignments', confirm=True, stdout=out)
        output = out.getvalue()

        self.assertIn("[APPLYING]", output)
        self.assertIn("TEST Patient A", output)
        self.assertIn("TEST Patient B", output)
        self.assertIn("TEST Patient C", output)

        # 1. Patients check
        patient_a = Patient.objects.get(mr_number='TEST-MR-001')
        patient_b = Patient.objects.get(mr_number='TEST-MR-002')
        patient_c = Patient.objects.get(mr_number='TEST-MR-003')

        self.assertEqual(patient_a.full_name, 'TEST Patient A')
        self.assertEqual(patient_b.full_name, 'TEST Patient B')
        self.assertEqual(patient_c.full_name, 'TEST Patient C')

        # 2. Care manager checks
        manager_staff = StaffMember.objects.get(employee_id='TEST-MGR-01')
        self.assertEqual(patient_a.assigned_care_manager, manager_staff)
        self.assertEqual(patient_b.assigned_care_manager, manager_staff)
        self.assertIsNone(patient_c.assigned_care_manager)

        # 3. Family portal user check
        family_user = User.objects.get(username='family')
        self.assertEqual(patient_a.portal_user, family_user)
        self.assertIsNone(patient_b.portal_user)
        self.assertIsNone(patient_c.portal_user)

        # 4. Bookings check
        self.assertEqual(Booking.objects.filter(patient=patient_a).count(), 3)
        self.assertEqual(Booking.objects.filter(patient=patient_b).count(), 3)
        self.assertEqual(Booking.objects.filter(patient=patient_c).count(), 0)

    def test_running_twice_creates_no_duplicates(self):
        """Running the command twice must be idempotent: 0 duplicate patients, 0 duplicate bookings."""
        call_command('seed_test_assignments', confirm=True)
        initial_patients = Patient.objects.filter(mr_number__startswith='TEST-').count()
        initial_bookings = Booking.objects.filter(patient__mr_number__startswith='TEST-').count()

        # Run second time
        out = io.StringIO()
        call_command('seed_test_assignments', confirm=True, stdout=out)
        output = out.getvalue()

        self.assertIn("Updated/Verified Patient", output)
        self.assertIn("Existing Booking", output)

        self.assertEqual(Patient.objects.filter(mr_number__startswith='TEST-').count(), initial_patients)
        self.assertEqual(Booking.objects.filter(patient__mr_number__startswith='TEST-').count(), initial_bookings)
        self.assertEqual(initial_patients, 3)
        self.assertEqual(initial_bookings, 6)

    def test_nurse_sees_a_and_not_b_or_c(self):
        """Nurse user sees Patient A in staff portal and patient-file; receives 404 on B and C."""
        call_command('seed_test_assignments', confirm=True)
        nurse_user = User.objects.get(username='nurse')
        patient_a = Patient.objects.get(mr_number='TEST-MR-001')
        patient_b = Patient.objects.get(mr_number='TEST-MR-002')
        patient_c = Patient.objects.get(mr_number='TEST-MR-003')

        # Scoping helper check
        assigned_ids = get_assigned_patient_ids_for_clinician(nurse_user)
        self.assertIn(patient_a.id, assigned_ids)
        self.assertNotIn(patient_b.id, assigned_ids)
        self.assertNotIn(patient_c.id, assigned_ids)

        # API checks
        self.client.force_authenticate(user=nurse_user)
        res_list = self.client.get('/api/staff-portal/patients/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        pids = [p['id'] for p in res_list.data.get('results', [])]
        self.assertIn(patient_a.id, pids)
        self.assertNotIn(patient_b.id, pids)
        self.assertNotIn(patient_c.id, pids)

        # Patient file hub checks
        res_file_a = self.client.get(f'/api/patients/{patient_a.id}/patient-file/')
        self.assertEqual(res_file_a.status_code, status.HTTP_200_OK)

        res_file_b = self.client.get(f'/api/patients/{patient_b.id}/patient-file/')
        self.assertEqual(res_file_b.status_code, status.HTTP_404_NOT_FOUND)

        res_file_c = self.client.get(f'/api/patients/{patient_c.id}/patient-file/')
        self.assertEqual(res_file_c.status_code, status.HTTP_404_NOT_FOUND)

    def test_doctor_sees_a_only(self):
        """Doctor user sees Patient A only (treating doctor within active care window); 404 on B and C."""
        call_command('seed_test_assignments', confirm=True)
        doc_user = User.objects.get(username='doctor')
        patient_a = Patient.objects.get(mr_number='TEST-MR-001')
        patient_b = Patient.objects.get(mr_number='TEST-MR-002')
        patient_c = Patient.objects.get(mr_number='TEST-MR-003')

        # Scoping & treating doctor helpers
        assigned_ids = get_assigned_patient_ids_for_clinician(doc_user)
        self.assertIn(patient_a.id, assigned_ids)
        self.assertNotIn(patient_b.id, assigned_ids)
        self.assertNotIn(patient_c.id, assigned_ids)

        self.assertTrue(is_treating_doctor_for_patient(doc_user, patient_a))
        self.assertFalse(is_treating_doctor_for_patient(doc_user, patient_b))
        self.assertFalse(is_treating_doctor_for_patient(doc_user, patient_c))

        # API checks
        self.client.force_authenticate(user=doc_user)
        res_list = self.client.get('/api/staff-portal/patients/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        pids = [p['id'] for p in res_list.data.get('results', [])]
        self.assertIn(patient_a.id, pids)
        self.assertNotIn(patient_b.id, pids)
        self.assertNotIn(patient_c.id, pids)

        res_file_a = self.client.get(f'/api/patients/{patient_a.id}/patient-file/')
        self.assertEqual(res_file_a.status_code, status.HTTP_200_OK)

        res_file_b = self.client.get(f'/api/patients/{patient_b.id}/patient-file/')
        self.assertEqual(res_file_b.status_code, status.HTTP_404_NOT_FOUND)

        res_file_c = self.client.get(f'/api/patients/{patient_c.id}/patient-file/')
        self.assertEqual(res_file_c.status_code, status.HTTP_404_NOT_FOUND)

    def test_speech_psych_and_dietician_see_b_only(self):
        """Speech, psych, and dietician therapists see Patient B only; receive 404 on A and C."""
        call_command('seed_test_assignments', confirm=True)
        patient_a = Patient.objects.get(mr_number='TEST-MR-001')
        patient_b = Patient.objects.get(mr_number='TEST-MR-002')
        patient_c = Patient.objects.get(mr_number='TEST-MR-003')

        for username in ['speech', 'psych', 'dietician']:
            user = User.objects.get(username=username)

            # Scoping helper
            assigned_ids = get_assigned_patient_ids_for_clinician(user)
            self.assertIn(patient_b.id, assigned_ids, f"{username} should see Patient B")
            self.assertNotIn(patient_a.id, assigned_ids, f"{username} should NOT see Patient A")
            self.assertNotIn(patient_c.id, assigned_ids, f"{username} should NOT see Patient C")

            # API checks
            self.client.force_authenticate(user=user)
            res_list = self.client.get('/api/staff-portal/patients/')
            self.assertEqual(res_list.status_code, status.HTTP_200_OK)
            pids = [p['id'] for p in res_list.data.get('results', [])]
            self.assertIn(patient_b.id, pids, f"{username} list should contain Patient B")
            self.assertNotIn(patient_a.id, pids, f"{username} list should NOT contain Patient A")
            self.assertNotIn(patient_c.id, pids, f"{username} list should NOT contain Patient C")

            res_file_b = self.client.get(f'/api/patients/{patient_b.id}/patient-file/')
            self.assertEqual(res_file_b.status_code, status.HTTP_200_OK, f"{username} should access B patient-file")

            res_file_a = self.client.get(f'/api/patients/{patient_a.id}/patient-file/')
            self.assertEqual(res_file_a.status_code, status.HTTP_404_NOT_FOUND, f"{username} should get 404 on A")

            res_file_c = self.client.get(f'/api/patients/{patient_c.id}/patient-file/')
            self.assertEqual(res_file_c.status_code, status.HTTP_404_NOT_FOUND, f"{username} should get 404 on C")

    def test_manager_sees_a_and_b(self):
        """Care Manager is assigned to Patients A and B (is_care_manager_for_patient is True); not C."""
        call_command('seed_test_assignments', confirm=True)
        cm_user = User.objects.get(username='manager')
        patient_a = Patient.objects.get(mr_number='TEST-MR-001')
        patient_b = Patient.objects.get(mr_number='TEST-MR-002')
        patient_c = Patient.objects.get(mr_number='TEST-MR-003')

        # Care manager helper checks
        self.assertTrue(is_care_manager_for_patient(cm_user, patient_a))
        self.assertTrue(is_care_manager_for_patient(cm_user, patient_b))
        self.assertFalse(is_care_manager_for_patient(cm_user, patient_c))

        # Model ForeignKeys
        manager_staff = StaffMember.objects.get(employee_id='TEST-MGR-01')
        self.assertEqual(patient_a.assigned_care_manager, manager_staff)
        self.assertEqual(patient_b.assigned_care_manager, manager_staff)
        self.assertIsNone(patient_c.assigned_care_manager)

    def test_family_sees_a_only(self):
        """Family user sees Patient A only via portal_user; gets 403 on B and C."""
        call_command('seed_test_assignments', confirm=True)
        family_user = User.objects.get(username='family')
        patient_a = Patient.objects.get(mr_number='TEST-MR-001')
        patient_b = Patient.objects.get(mr_number='TEST-MR-002')
        patient_c = Patient.objects.get(mr_number='TEST-MR-003')

        self.assertEqual(patient_a.portal_user, family_user)
        self.assertIsNone(patient_b.portal_user)
        self.assertIsNone(patient_c.portal_user)

        self.client.force_authenticate(user=family_user)

        # GET /api/patients/ lists only patient_a
        res_list = self.client.get('/api/patients/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        pids = [p['id'] for p in res_list.data.get('results', [])]
        self.assertIn(patient_a.id, pids)
        self.assertNotIn(patient_b.id, pids)
        self.assertNotIn(patient_c.id, pids)

        # GET /api/patients/{id}/ object permission
        res_a = self.client.get(f'/api/patients/{patient_a.id}/')
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)

        res_b = self.client.get(f'/api/patients/{patient_b.id}/')
        self.assertEqual(res_b.status_code, status.HTTP_403_FORBIDDEN)

        res_c = self.client.get(f'/api/patients/{patient_c.id}/')
        self.assertEqual(res_c.status_code, status.HTTP_403_FORBIDDEN)

    def test_nobody_except_admin_roles_sees_c(self):
        """Patient C is unassigned to all clinical and family users; only admin and super_admin see C."""
        call_command('seed_test_assignments', confirm=True)
        patient_c = Patient.objects.get(mr_number='TEST-MR-003')

        # 1. Non-admin clinical roles get 404
        for username in ['nurse', 'doctor', 'physio', 'speech', 'psych', 'dietician']:
            user = User.objects.get(username=username)
            self.client.force_authenticate(user=user)
            res = self.client.get(f'/api/patients/{patient_c.id}/patient-file/')
            self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND, f"{username} should get 404 on Patient C")

        # 2. Family user gets 403
        family_user = User.objects.get(username='family')
        self.client.force_authenticate(user=family_user)
        res_fam = self.client.get(f'/api/patients/{patient_c.id}/')
        self.assertEqual(res_fam.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Manager is not assigned
        cm_user = User.objects.get(username='manager')
        self.assertFalse(is_care_manager_for_patient(cm_user, patient_c))

        # 4. Admin and Super Admin can reach Patient C
        admin_user = User.objects.filter(is_staff=True).first()
        if not admin_user:
            admin_user = User.objects.create_user(username='test_admin_c', password='password123', is_staff=True)

        self.client.force_authenticate(user=admin_user)
        res_admin = self.client.get(f'/api/patients/{patient_c.id}/patient-file/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)

        super_admin_user = User.objects.filter(is_superuser=True).first()
        if not super_admin_user:
            super_admin_user = User.objects.create_superuser(username='test_super_c', password='password123')

        self.client.force_authenticate(user=super_admin_user)
        res_super = self.client.get(f'/api/patients/{patient_c.id}/patient-file/')
        self.assertEqual(res_super.status_code, status.HTTP_200_OK)

    def test_no_clinical_rows_are_created(self):
        """Management command must create ZERO clinical records of any kind."""
        call_command('seed_test_assignments', confirm=True)
        test_patients = Patient.objects.filter(mr_number__startswith='TEST-')

        self.assertEqual(VitalSign.objects.filter(patient__in=test_patients).count(), 0)
        self.assertEqual(NurseNote.objects.filter(patient__in=test_patients).count(), 0)
        self.assertEqual(DoctorNote.objects.filter(patient__in=test_patients).count(), 0)
        self.assertEqual(Prescription.objects.filter(patient__in=test_patients).count(), 0)
        self.assertEqual(PhysioNote.objects.filter(patient__in=test_patients).count(), 0)
        self.assertEqual(TherapyNote.objects.filter(patient__in=test_patients).count(), 0)
        self.assertEqual(ClinicalConsent.objects.filter(patient__in=test_patients).count(), 0)
        self.assertEqual(LabResult.objects.filter(patient__in=test_patients).count(), 0)
        self.assertEqual(MARAdministration.objects.filter(prescription__patient__in=test_patients).count(), 0)
        self.assertEqual(LabOrder.objects.filter(patient__in=test_patients).count(), 0)
        self.assertEqual(LabReport.objects.filter(lab_order__patient__in=test_patients).count(), 0)

    def test_list_option_prints_table_without_changing_anything(self):
        """--list flag must output reachability matrix and make 0 database modifications."""
        out = io.StringIO()
        call_command('seed_test_assignments', list=True, stdout=out)
        output = out.getvalue()

        self.assertIn("TEST DATA ASSIGNMENT & REACHABILITY MATRIX", output)
        self.assertIn("nurse", output)
        self.assertIn("doctor", output)
        self.assertIn("manager", output)
        self.assertIn("family", output)
        # Verify no patients created if none existed
        self.assertEqual(Patient.objects.filter(mr_number='TEST-MR-001').count(), 0)

