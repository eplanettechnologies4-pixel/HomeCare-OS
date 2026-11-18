import datetime
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog
from staff.models import StaffMember
from patients.models import (
    Patient, Prescription, VitalSign, NurseNote, LabResult,
    MARAdministration, ScheduledItem, DoctorNote,
)
from patients.record_integrity import evaluate_vitals_alert_tier


class ClinicalRecordIntegrityTests(APITestCase):
    """
    EMR Clinical Record Integrity Test Suite:
    - Zero physical delete across all clinical models (model.delete() & API DELETE)
    - 15-minute author edit window enforcement (400 after window)
    - Non-author edit blocked (403)
    - Entered-in-error workflow, RBAC (author in window, assigned doctor anytime, admin/CM 403)
    - Non-empty reason required (400)
    - Irreversibility & immutability of entered-in-error records (400)
    - Alert tiering & summary exclusion
    - MARAdministration immutability & prescription locking preservation
    - Audit logging without clinical values
    """

    def setUp(self):
        self.now = timezone.now()

        # Users & Staff Members
        # 1. Treating Doctor (assigned)
        self.doc_user = User.objects.create_user(username='doc_assigned', password='pass', first_name='Raza', last_name='Khan')
        self.doc_staff = StaffMember.objects.create(
            user=self.doc_user, first_name='Raza', last_name='Khan', role='doctor',
            employee_id='DOC-001', phone='+923415339483', status='available',
            hire_date=datetime.date(2021, 1, 1)
        )

        # 2. Unassigned Doctor
        self.doc_unassigned = User.objects.create_user(username='doc_unassigned', password='pass', first_name='Farooq', last_name='Ahmed')
        self.doc_unassigned_staff = StaffMember.objects.create(
            user=self.doc_unassigned, first_name='Farooq', last_name='Ahmed', role='doctor',
            employee_id='DOC-002', phone='+923415339484', status='available',
            hire_date=datetime.date(2021, 1, 1)
        )

        # 3. Nurse (author)
        self.nurse_user = User.objects.create_user(username='nurse_author', password='pass', first_name='Sarah', last_name='Mitchell')
        self.nurse_staff = StaffMember.objects.create(
            user=self.nurse_user, first_name='Sarah', last_name='Mitchell', role='nurse',
            employee_id='NUR-001', phone='+923415339485', status='available',
            hire_date=datetime.date(2021, 1, 1)
        )

        # 4. Another Nurse (non-author)
        self.nurse2_user = User.objects.create_user(username='nurse_other', password='pass', first_name='Fatima', last_name='Ali')
        self.nurse2_staff = StaffMember.objects.create(
            user=self.nurse2_user, first_name='Fatima', last_name='Ali', role='nurse',
            employee_id='NUR-002', phone='+923415339486', status='available',
            hire_date=datetime.date(2021, 1, 1)
        )

        # 5. Care Manager
        self.cm_user = User.objects.create_user(username='cm_user', password='pass', first_name='Amina', last_name='Tariq')
        self.cm_staff = StaffMember.objects.create(
            user=self.cm_user, first_name='Amina', last_name='Tariq', role='care_manager',
            employee_id='CM-001', phone='+923415339487', status='available',
            hire_date=datetime.date(2021, 1, 1)
        )

        # 6. Admin
        self.admin_user = User.objects.create_user(username='admin_user', password='pass', is_staff=True)
        self.admin_staff = StaffMember.objects.create(
            user=self.admin_user, first_name='System', last_name='Admin', role='admin',
            employee_id='ADM-001', status='available',
            hire_date=datetime.date(2021, 1, 1)
        )



        # 7. Super Admin
        self.super_user = User.objects.create_superuser(username='super_user', password='pass')

        # Patient
        self.patient = Patient.objects.create(
            first_name='Zubaida',
            last_name='Khanum',
            date_of_birth=datetime.date(1952, 4, 12),
            gender='female',
            mr_number='MR-88201',
            patient_code='PT-88201',
            address='F-8/2, Street 15, Islamabad',
            primary_diagnosis='Hypertensive Heart Disease',
            assigned_care_manager=self.cm_staff,
            is_active=True,
        )

        from bookings.models import Booking, BookingStatus
        # 1. Doctor booking -> confers treating doctor status
        self.doc_booking = Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.doc_staff,
            scheduled_time=self.now,
            status=BookingStatus.ASSIGNED,
        )

        # 2. Nurse booking -> confers assigned nurse status
        self.nurse_booking = Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.nurse_staff,
            scheduled_time=self.now,
            status=BookingStatus.ASSIGNED,
        )
        self.nurse2_booking = Booking.objects.create(
            patient=self.patient,
            assigned_staff=self.nurse2_staff,
            scheduled_time=self.now,
            status=BookingStatus.ASSIGNED,
        )


    # ── Test 1: Zero Physical Delete on Model & API ────────────────────────────

    def test_01_model_delete_raises_validation_error(self):
        """Model-level .delete() must raise ValidationError on all clinical models."""
        # 1. VitalSign
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=120, blood_pressure_diastolic=80
        )
        with self.assertRaises(ValidationError) as ctx:
            vital.delete()
        self.assertIn("Physical deletion of clinical records is prohibited", str(ctx.exception))

        # 2. NurseNote
        note = NurseNote.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff, note='Bedside assessment.'
        )
        with self.assertRaises(ValidationError) as ctx:
            note.delete()
        self.assertIn("Physical deletion of clinical records is prohibited", str(ctx.exception))

        # 3. LabResult
        lab = LabResult.objects.create(
            patient=self.patient, test_name='CBC', result_value='13.5', collected_at=self.now
        )
        with self.assertRaises(ValidationError) as ctx:
            lab.delete()
        self.assertIn("Physical deletion of clinical records is prohibited", str(ctx.exception))

        # 4. ScheduledItem
        sched = ScheduledItem.objects.create(
            patient=self.patient, kind=ScheduledItem.Kind.PROCEDURE, title='Wound Debridement',
            due_at=self.now + datetime.timedelta(days=1), created_by=self.doc_user
        )
        with self.assertRaises(ValidationError) as ctx:
            sched.delete()
        self.assertIn("Physical deletion of clinical records is prohibited", str(ctx.exception))

        # 5. MARAdministration
        rx = Prescription.objects.create(
            patient=self.patient, medication='Amlodipine 5mg', dosage='5mg', frequency='Daily',
            prescribed_by='Dr. Raza Khan', entry_mode='doctor', verification_status='verified',
            verified_at=self.now, date=self.now.date()
        )
        mar = MARAdministration.objects.create(
            prescription=rx, day_number=self.now.weekday(), administered_by=self.nurse_staff,
            administered_at=self.now
        )
        with self.assertRaises(ValidationError) as ctx:
            mar.delete()
        self.assertIn("Physical deletion of clinical records is prohibited", str(ctx.exception))

    def test_02_api_delete_returns_405_method_not_allowed(self):
        """API DELETE routes return 405 Method Not Allowed and log audit entry."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=130, blood_pressure_diastolic=85
        )
        note = NurseNote.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff, note='Patient resting.'
        )
        lab = LabResult.objects.create(
            patient=self.patient, test_name='Serum Sodium', result_value='138', collected_at=self.now
        )

        # 1. Flat routes DELETE
        self.client.force_authenticate(user=self.nurse_user)
        res_v = self.client.delete(f"/api/patients/vitals/{vital.id}/")
        self.assertEqual(res_v.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertIn("prohibited", res_v.data.get('detail', '').lower())

        res_n = self.client.delete(f"/api/patients/notes/{note.id}/")
        self.assertEqual(res_n.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        res_l = self.client.delete(f"/api/patients/labs/{lab.id}/")
        self.assertEqual(res_l.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # 2. Scheduled Item DELETE
        sched = ScheduledItem.objects.create(
            patient=self.patient, kind=ScheduledItem.Kind.BLOOD_TEST, title='Lipid Profile',
            due_at=self.now + datetime.timedelta(days=2), created_by=self.doc_user
        )
        self.client.force_authenticate(user=self.doc_user)
        res_s = self.client.delete(f"/api/patients/{self.patient.id}/scheduled-items/{sched.id}/")
        self.assertEqual(res_s.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # Check AuditLog for blocked delete
        log = AuditLog.objects.filter(action='Clinical Delete Blocked', details__contains='VitalSign').first()
        self.assertIsNotNone(log)
        self.assertIn("VitalSign", log.details)
        # Verify privacy: no clinical measurement values in details
        self.assertNotIn("130", log.details)

    # ── Test 2: Edit Window Enforcement (15 Minutes) ──────────────────────────

    def test_03_author_edit_within_15_minutes_succeeds(self):
        """Author can PATCH/PUT their own record within 15 minutes of creation."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=120, blood_pressure_diastolic=80
        )
        # Record is fresh (0 minutes elapsed)
        self.client.force_authenticate(user=self.nurse_user)
        res_patch = self.client.patch(f"/api/patients/vitals/{vital.id}/", {
            'blood_pressure_systolic': 122, 'blood_pressure_diastolic': 82
        }, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        vital.refresh_from_db()
        self.assertEqual(vital.blood_pressure_systolic, 122)

    def test_04_author_edit_after_15_minutes_fails_with_400(self):
        """Author cannot PATCH/PUT their own record once 15 minutes have elapsed."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=120, blood_pressure_diastolic=80
        )
        # Artificially age the record by 16 minutes
        sixteen_min_ago = self.now - datetime.timedelta(minutes=16)
        VitalSign.objects.filter(pk=vital.id).update(created_at=sixteen_min_ago, recorded_at=sixteen_min_ago)
        vital.refresh_from_db()

        self.client.force_authenticate(user=self.nurse_user)
        res_patch = self.client.patch(f"/api/patients/vitals/{vital.id}/", {
            'blood_pressure_systolic': 130
        }, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", res_patch.data.get('detail', '').lower())
        self.assertIn("entered-in-error", res_patch.data.get('detail', '').lower())

        # Check AuditLog for expired edit attempt without clinical values
        audit = AuditLog.objects.filter(action='Clinical Edit Blocked').first()
        self.assertIsNotNone(audit)
        self.assertIn("VitalSign", audit.details)
        self.assertNotIn("130", audit.details)

    def test_05_non_author_edit_fails_with_403(self):
        """Another clinician cannot edit someone else's record, even within window."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=120, blood_pressure_diastolic=80
        )
        # Nurse 2 (different nurse) tries to edit
        self.client.force_authenticate(user=self.nurse2_user)
        res_n2 = self.client.patch(f"/api/patients/vitals/{vital.id}/", {
            'blood_pressure_systolic': 125
        }, format='json')
        self.assertEqual(res_n2.status_code, status.HTTP_403_FORBIDDEN)

        # Treating doctor also cannot directly overwrite someone else's observation
        self.client.force_authenticate(user=self.doc_user)
        res_doc = self.client.patch(f"/api/patients/vitals/{vital.id}/", {
            'blood_pressure_systolic': 125
        }, format='json')
        self.assertEqual(res_doc.status_code, status.HTTP_403_FORBIDDEN)

    def test_06_lab_result_direct_edit_disabled(self):
        """LabResult PUT/PATCH returns 405 Method Not Allowed."""
        lab = LabResult.objects.create(
            patient=self.patient, test_name='Hemoglobin', result_value='11.0', collected_at=self.now
        )
        self.client.force_authenticate(user=self.doc_user)
        res_patch = self.client.patch(f"/api/patients/labs/{lab.id}/", {
            'result_value': '12.0'
        }, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertIn("disabled", res_patch.data.get('detail', '').lower())

    # ── Test 3: Mark Entered-In-Error Workflow & RBAC ─────────────────────────

    def test_07_mark_entered_in_error_author_within_window(self):
        """Author can mark their own record entered-in-error within the 15-minute window."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=220, blood_pressure_diastolic=120
        )
        self.client.force_authenticate(user=self.nurse_user)
        res_err = self.client.post(f"/api/patients/vitals/{vital.id}/mark-entered-in-error/", {
            'reason': 'Incorrect cuff size used; reading inaccurate.'
        }, format='json')
        self.assertEqual(res_err.status_code, status.HTTP_200_OK)
        vital.refresh_from_db()
        self.assertTrue(vital.is_entered_in_error)
        self.assertEqual(vital.entered_in_error_by, self.nurse_user)
        self.assertEqual(vital.entered_in_error_reason, 'Incorrect cuff size used; reading inaccurate.')
        self.assertIsNotNone(vital.entered_in_error_at)

    def test_08_mark_entered_in_error_treating_doctor_at_any_time(self):
        """Assigned treating doctor can mark records entered-in-error at any time."""
        # Vital created 5 hours ago by a nurse
        five_hrs_ago = self.now - datetime.timedelta(hours=5)
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=five_hrs_ago, blood_pressure_systolic=190, blood_pressure_diastolic=100
        )
        VitalSign.objects.filter(pk=vital.id).update(created_at=five_hrs_ago)
        vital.refresh_from_db()

        # Author nurse now gets 403 (outside window)
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse = self.client.post(f"/api/patients/vitals/{vital.id}/mark-entered-in-error/", {
            'reason': 'Nurse late error mark attempt'
        }, format='json')
        self.assertEqual(res_nurse.status_code, status.HTTP_403_FORBIDDEN)

        # Assigned treating doctor CAN mark it
        self.client.force_authenticate(user=self.doc_user)
        res_doc = self.client.post(f"/api/patients/{self.patient.id}/vitals/{vital.id}/mark-entered-in-error/", {
            'reason': 'Physician verified erroneous cuff reading upon review.'
        }, format='json')
        self.assertEqual(res_doc.status_code, status.HTTP_200_OK)
        vital.refresh_from_db()
        self.assertTrue(vital.is_entered_in_error)
        self.assertEqual(vital.entered_in_error_by, self.doc_user)

    def test_09_mark_entered_in_error_forbidden_for_other_roles(self):
        """Admin, super_admin, care_manager, unassigned doctor receive 403 Forbidden."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=120, blood_pressure_diastolic=80
        )
        forbidden_users = [
            ('admin', self.admin_user),
            ('super_admin', self.super_user),
            ('care_manager', self.cm_user),
            ('unassigned_doctor', self.doc_unassigned),
            ('other_nurse', self.nurse2_user),
        ]
        for role_name, u in forbidden_users:
            self.client.force_authenticate(user=u)
            res = self.client.post(f"/api/patients/vitals/{vital.id}/mark-entered-in-error/", {
                'reason': f'Unauthorized mark attempt by {role_name}'
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"Role {role_name} must receive 403")

    def test_10_mark_entered_in_error_mandatory_reason(self):
        """Marking entered in error requires a non-empty reason (400 if missing)."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=120, blood_pressure_diastolic=80
        )
        self.client.force_authenticate(user=self.nurse_user)
        # Empty payload
        res_empty = self.client.post(f"/api/patients/vitals/{vital.id}/mark-entered-in-error/", {}, format='json')
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)
        # Whitespace only
        res_ws = self.client.post(f"/api/patients/vitals/{vital.id}/mark-entered-in-error/", {'reason': '   '}, format='json')
        self.assertEqual(res_ws.status_code, status.HTTP_400_BAD_REQUEST)

    def test_11_irreversible_second_mark_fails(self):
        """Once marked entered in error, a second mark call returns 400 Bad Request."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=120, blood_pressure_diastolic=80
        )
        self.client.force_authenticate(user=self.nurse_user)
        res1 = self.client.post(f"/api/patients/vitals/{vital.id}/mark-entered-in-error/", {
            'reason': 'First mark reason'
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second mark attempt
        res2 = self.client.post(f"/api/patients/vitals/{vital.id}/mark-entered-in-error/", {
            'reason': 'Second mark attempt'
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already", res2.data.get('error', '').lower())

    def test_12_entered_in_error_record_cannot_be_edited(self):
        """An entered-in-error record cannot be edited via PUT/PATCH (400 Bad Request)."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=120, blood_pressure_diastolic=80
        )
        self.client.force_authenticate(user=self.nurse_user)
        self.client.post(f"/api/patients/vitals/{vital.id}/mark-entered-in-error/", {
            'reason': 'Wrong patient file'
        }, format='json')

        # Attempt to edit
        res_edit = self.client.patch(f"/api/patients/vitals/{vital.id}/", {
            'blood_pressure_systolic': 118
        }, format='json')
        self.assertEqual(res_edit.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("entered in error", res_edit.data.get('error', '').lower())

    # ── Test 4: Computation & Alert Exclusion ─────────────────────────────────

    def test_13_erroneous_vital_excluded_from_alert_tiering(self):
        """Erroneous vitals (e.g. 220/120 BP) must evaluate to None in alert tiering."""
        vital_crit = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=220, blood_pressure_diastolic=120
        )
        # Before error marking -> 'critical'
        self.assertEqual(evaluate_vitals_alert_tier(vital_crit), 'critical')

        # After error marking -> None (ignored)
        vital_crit.mark_as_entered_in_error(self.doc_user, 'Erroneous measurement entered by student nurse')
        self.assertEqual(evaluate_vitals_alert_tier(vital_crit), None)

    # ── Test 5: MAR Immutability & Prescription Lock Preservation ─────────────

    def test_14_mar_administration_never_editable_or_deletable(self):
        """MAR row has zero physical delete; marking error preserves prescription lock."""
        rx = Prescription.objects.create(
            patient=self.patient, medication='Metoprolol 25mg', dosage='25mg', frequency='BD',
            prescribed_by='Dr. Raza Khan', entry_mode='doctor', verification_status='verified',
            verified_at=self.now, date=self.now.date()
        )
        mar = MARAdministration.objects.create(
            prescription=rx, day_number=self.now.weekday(), administered_by=self.nurse_staff,
            administered_at=self.now
        )

        # Model delete blocked
        with self.assertRaises(ValidationError):
            mar.delete()

        # Doctor marks MAR entry entered in error via patient-scoped action
        self.client.force_authenticate(user=self.doc_user)
        res_mar_err = self.client.post(f"/api/patients/{self.patient.id}/mar/{mar.id}/mark-entered-in-error/", {
            'reason': 'Patient spat out tablet; not swallowed.'
        }, format='json')
        self.assertEqual(res_mar_err.status_code, status.HTTP_200_OK)
        mar.refresh_from_db()
        self.assertTrue(mar.is_entered_in_error)

        # Prescription lock: rx CANNOT be deleted or edited even though MAR is entered in error
        # administrations.exists() is True!
        self.assertTrue(rx.administrations.exists())
        with self.assertRaises(ValidationError):
            rx.delete()

    # ── Test 6: Audit Logging Compliance ──────────────────────────────────────

    def test_15_audit_logs_contain_no_clinical_text(self):
        """AuditLog entries for record integrity actions contain NO clinical text or measurements."""
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=195, blood_pressure_diastolic=115,
            notes='Severe chest heaviness reported'
        )
        self.client.force_authenticate(user=self.nurse_user)
        self.client.post(f"/api/patients/vitals/{vital.id}/mark-entered-in-error/", {
            'reason': 'Equipment calibration error'
        }, format='json')

        log = AuditLog.objects.filter(action='Mark Record Entered in Error').order_by('-timestamp').first()
        self.assertIsNotNone(log)
        # Reason and record id are logged
        self.assertIn("VitalSign", log.details)
        self.assertIn("Equipment calibration error", log.details)
        # Privacy: clinical readings and notes are NOT logged
        self.assertNotIn("195", log.details)
        self.assertNotIn("115", log.details)
        self.assertNotIn("Severe chest heaviness", log.details)

    # ── Test 7: Patient Cascade Delete Protection & Bulk QuerySet Guard ──────

    def test_16_orm_patient_delete_raises_protected_error_and_preserves_clinical_rows(self):
        """
        Calling patient.delete() in ORM must raise ProtectedError when clinical records exist,
        and MUST NOT destroy any clinical records.
        """
        from django.db.models import ProtectedError
        patient = Patient.objects.create(
            first_name='CascadeORM', last_name='Test', date_of_birth=datetime.date(1975, 5, 20),
            gender='male', mr_number='MR-CASC-001'
        )
        v = VitalSign.objects.create(patient=patient, recorded_by=self.nurse_staff, recorded_at=self.now, blood_pressure_systolic=120)
        nn = NurseNote.objects.create(patient=patient, recorded_by=self.nurse_staff, note='Assessment note')
        lr = LabResult.objects.create(patient=patient, test_name='CBC', result_value='13.5', collected_at=self.now)
        rx = Prescription.objects.create(
            patient=patient, medication='Metformin', dosage='500mg', frequency='Twice daily',
            prescribed_by='Dr. Raza Khan', entry_mode='doctor', verification_status='verified',
            verified_at=self.now, date=self.now.date()
        )
        mar = MARAdministration.objects.create(prescription=rx, day_number=1, administered_by=self.nurse_staff, administered_at=self.now)
        dn = DoctorNote.objects.create(patient=patient, doctor=self.doc_staff, notes='Evaluation notes', plan='Rehab', is_signed=True, signed_at=self.now)
        si = ScheduledItem.objects.create(patient=patient, kind='blood_test', title='Follow-up CBC', due_at=self.now, created_by=self.doc_user)

        # Attempt ORM deletion
        with self.assertRaises(ProtectedError):
            patient.delete()

        # Verify all clinical rows remain untouched
        self.assertTrue(Patient.objects.filter(id=patient.id).exists())
        self.assertTrue(VitalSign.objects.filter(id=v.id).exists())
        self.assertTrue(NurseNote.objects.filter(id=nn.id).exists())
        self.assertTrue(LabResult.objects.filter(id=lr.id).exists())
        self.assertTrue(Prescription.objects.filter(id=rx.id).exists())
        self.assertTrue(MARAdministration.objects.filter(id=mar.id).exists())
        self.assertTrue(DoctorNote.objects.filter(id=dn.id).exists())
        self.assertTrue(ScheduledItem.objects.filter(id=si.id).exists())

    def test_17_api_delete_patient_with_clinical_records_returns_409_as_admin_and_super_admin(self):
        """
        API DELETE /api/patients/{id}/ returns 409 Conflict when clinical records exist,
        for both admin and super_admin, and preserves all rows.
        """
        for role_name, u in [('admin', self.admin_user), ('super_admin', self.super_user)]:
            mr = f'MR-APIDEL-{role_name[:4].upper()}'
            patient = Patient.objects.create(
                first_name='ApiDel', last_name=role_name, date_of_birth=datetime.date(1980, 1, 1),
                gender='female', mr_number=mr
            )
            v = VitalSign.objects.create(patient=patient, recorded_by=self.nurse_staff, recorded_at=self.now, blood_pressure_systolic=120)
            nn = NurseNote.objects.create(patient=patient, recorded_by=self.nurse_staff, note='Note')
            lr = LabResult.objects.create(patient=patient, test_name='Serum Creatinine', result_value='1.1', collected_at=self.now)
            rx = Prescription.objects.create(
                patient=patient, medication='Atorvastatin', dosage='20mg', frequency='Nightly',
                prescribed_by='Dr. Raza Khan', entry_mode='doctor', verification_status='verified',
                verified_at=self.now, date=self.now.date()
            )
            mar = MARAdministration.objects.create(prescription=rx, day_number=2, administered_by=self.nurse_staff, administered_at=self.now)
            dn = DoctorNote.objects.create(patient=patient, doctor=self.doc_staff, notes='Notes', plan='Plan', is_signed=True, signed_at=self.now)
            si = ScheduledItem.objects.create(patient=patient, kind='procedure', title='Dressing', due_at=self.now, created_by=self.doc_user)

            self.client.force_authenticate(user=u)
            res = self.client.delete(f'/api/patients/{patient.id}/')
            self.assertEqual(res.status_code, status.HTTP_409_CONFLICT, f"Failed for {role_name}")
            self.assertIn("clinical records exist", res.data.get('detail', '').lower())

            # Verify rows still exist
            self.assertTrue(Patient.objects.filter(id=patient.id).exists())
            self.assertTrue(VitalSign.objects.filter(id=v.id).exists())
            self.assertTrue(Prescription.objects.filter(id=rx.id).exists())
            self.assertTrue(MARAdministration.objects.filter(id=mar.id).exists())

    def test_18_api_delete_patient_without_clinical_records_returns_204(self):
        """
        API DELETE /api/patients/{id}/ allows deleting a patient with no clinical records.
        """
        patient = Patient.objects.create(
            first_name='NoRecords', last_name='Patient', date_of_birth=datetime.date(1990, 1, 1),
            gender='male', mr_number='MR-EMPTY-001'
        )
        self.client.force_authenticate(user=self.super_user)
        res = self.client.delete(f'/api/patients/{patient.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Patient.objects.filter(id=patient.id).exists())

    def test_19_queryset_bulk_delete_raises_validation_error(self):
        """
        QuerySet bulk .delete() on clinical models must raise ValidationError
        to prevent bypassing row-level delete guards.
        """
        vital = VitalSign.objects.create(
            patient=self.patient, recorded_by=self.nurse_staff,
            recorded_at=self.now, blood_pressure_systolic=120
        )
        with self.assertRaises(ValidationError) as ctx:
            VitalSign.objects.filter(id=vital.id).delete()
        self.assertIn("Physical deletion of clinical records is prohibited", str(ctx.exception))

        rx = Prescription.objects.create(
            patient=self.patient, medication='Omeprazole', dosage='20mg', frequency='Daily',
            prescribed_by='Dr. Raza Khan', entry_mode='doctor', verification_status='verified',
            verified_at=self.now, date=self.now.date()
        )
        with self.assertRaises(ValidationError) as ctx:
            Prescription.objects.filter(id=rx.id).delete()
        self.assertIn("Physical deletion of clinical records is prohibited", str(ctx.exception))

    def test_20_django_admin_has_delete_permission_is_false(self):
        """
        Clinical models registered in Django admin must have has_delete_permission returning False.
        """
        from django.contrib.admin.sites import site
        from django.test import RequestFactory
        factory = RequestFactory()
        req = factory.get('/admin/')
        req.user = self.super_user

        for model in [VitalSign, NurseNote, Prescription, MARAdministration, LabResult, ScheduledItem, DoctorNote]:
            model_admin = site._registry.get(model)
            self.assertIsNotNone(model_admin, f"{model.__name__} should be registered in admin")
            self.assertFalse(model_admin.has_delete_permission(req), f"{model.__name__} has_delete_permission must be False")
            self.assertFalse(model_admin.has_delete_permission(req, obj=model()), f"{model.__name__} has_delete_permission(obj) must be False")
