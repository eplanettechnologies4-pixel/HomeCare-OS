import datetime
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from staff.models import StaffMember, StaffRole
from patients.models import (
    Patient, Prescription, VitalSign, NurseNote, DoctorNote,
    PhysioNote, MARAdministration
)
from bookings.models import Booking, BookingStatus, ServiceType, ShiftDuration
from quality.models import ManagerVisitChecklist

User = get_user_model()


class AssignedPatientScopingTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Nurse A
        self.nurse_user_a = User.objects.create_user(username='nurse_a', password='TestPassword123!')
        self.staff_a = StaffMember.objects.create(
            user=self.nurse_user_a,
            first_name='Nurse',
            last_name='Alpha',
            role=StaffRole.NURSE,
            employee_id='NURSE-001',
            platform_allowed='both',
            hire_date=datetime.date(2025, 1, 1),
            transport_driver_name='Default Van Driver',
            transport_driver_phone='+923000000001',
            transport_pickup_time='07:00 AM'
        )

        # 2. Nurse B
        self.nurse_user_b = User.objects.create_user(username='nurse_b', password='TestPassword123!')
        self.staff_b = StaffMember.objects.create(
            user=self.nurse_user_b,
            first_name='Nurse',
            last_name='Beta',
            role=StaffRole.NURSE,
            employee_id='NURSE-002',
            platform_allowed='both',
            hire_date=datetime.date(2025, 1, 1)
        )

        # 3. Doctor
        self.doc_user = User.objects.create_user(username='dr_alam', password='TestPassword123!')
        self.doc_staff = StaffMember.objects.create(
            user=self.doc_user,
            first_name='Dr',
            last_name='Alam',
            role=StaffRole.DOCTOR,
            employee_id='DOC-001',
            platform_allowed='both',
            hire_date=datetime.date(2024, 1, 1)
        )

        # 4. Care Manager
        self.cm_user = User.objects.create_user(username='cm_hina', password='TestPassword123!')
        self.cm_staff = StaffMember.objects.create(
            user=self.cm_user,
            first_name='Hina',
            last_name='Malik',
            role=StaffRole.CARE_MANAGER,
            employee_id='CM-001',
            platform_allowed='both',
            hire_date=datetime.date(2024, 1, 1)
        )

        # 5. Patient A (Assigned to Nurse A)
        self.patient_a = Patient.objects.create(
            mr_number='MR-001',
            patient_code='PT-001',
            first_name='Patient',
            last_name='Alpha',
            date_of_birth=datetime.date(1960, 5, 10),
            gender='M',
            primary_diagnosis='Hypertension & Diabetes',
            address='123 Hospital St',
            assigned_care_manager=self.cm_staff,
        )

        # 6. Patient B (Unassigned to Nurse A)
        self.patient_b = Patient.objects.create(
            mr_number='MR-002',
            patient_code='PT-002',
            first_name='Patient',
            last_name='Beta',
            date_of_birth=datetime.date(1955, 3, 15),
            gender='F',
            primary_diagnosis='Post-CVA Stroke Care',
            address='456 Recovery Rd',
            assigned_care_manager=self.cm_staff,
        )

        # Active Booking assigning Patient A to Nurse A
        now = timezone.now()
        self.booking_a = Booking.objects.create(
            patient=self.patient_a,
            assigned_staff=self.staff_a,
            service_type=ServiceType.NURSING,
            status=BookingStatus.IN_PROGRESS,
            scheduled_time=now - datetime.timedelta(hours=1),
            shift_end_time=now + datetime.timedelta(hours=7),
            shift_duration=ShiftDuration.EIGHT_HOURS,
            address=self.patient_a.address,
            amount=Decimal('5000.00'),
            transport_driver_name='Shift Specific Driver',
            transport_driver_phone='+923111111111',
            transport_pickup_time='06:45 AM',
        )

        # Add Prescription to Patient A
        self.rx_a = Prescription.objects.create(
            patient=self.patient_a,
            prescribed_by='Dr. Alam',
            date=now.date(),
            medication='Amlodipine',
            dosage='5mg',
            frequency='Daily'
        )

        # Active Booking assigning Patient B to Nurse B
        self.booking_b = Booking.objects.create(
            patient=self.patient_b,
            assigned_staff=self.staff_b,
            service_type=ServiceType.NURSING,
            status=BookingStatus.IN_PROGRESS,
            scheduled_time=now - datetime.timedelta(hours=1),
            shift_end_time=now + datetime.timedelta(hours=7),
            shift_duration=ShiftDuration.EIGHT_HOURS,
            address=self.patient_b.address,
            amount=Decimal('6000.00'),
        )

        self.rx_b = Prescription.objects.create(
            patient=self.patient_b,
            prescribed_by='Dr. Alam',
            date=now.date(),
            medication='Metformin',
            dosage='500mg',
            frequency='Twice Daily'
        )

    def test_nurse_a_has_full_read_write_access_to_assigned_patient_a(self):
        self.client.force_authenticate(user=self.nurse_user_a)

        # 1. Patient detail
        res = self.client.get(f"/api/patients/{self.patient_a.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 2. Vitals GET and POST
        res_vitals_get = self.client.get(f"/api/patients/{self.patient_a.id}/vitals/")
        self.assertEqual(res_vitals_get.status_code, status.HTTP_200_OK)

        res_vitals_post = self.client.post("/api/patients/vitals/", {
            'patient': self.patient_a.id,
            'recorded_at': timezone.now().isoformat(),
            'blood_pressure_systolic': 120,
            'blood_pressure_diastolic': 80,
            'heart_rate': 72,
            'spo2': 98,
        })
        self.assertEqual(res_vitals_post.status_code, status.HTTP_201_CREATED)

        # 3. Nurse Notes GET and POST
        res_notes_get = self.client.get(f"/api/patients/{self.patient_a.id}/nurse_notes/")
        self.assertEqual(res_notes_get.status_code, status.HTTP_200_OK)

        res_notes_post = self.client.post(f"/api/patients/{self.patient_a.id}/nurse_notes/", {
            'note': 'Morning routine observation: patient alert and responsive.',
            'booking_id': self.booking_a.id,
        })
        self.assertEqual(res_notes_post.status_code, status.HTTP_201_CREATED)

        # 4. MAR TodaysMeds GET and Administer POST
        res_meds = self.client.get(f"/api/patients/{self.patient_a.id}/mar/due-today/")
        self.assertEqual(res_meds.status_code, status.HTTP_200_OK)

        res_administer = self.client.post(f"/api/patients/{self.patient_a.id}/mar/administer/", {
            'prescription_id': self.rx_a.id,
            'day_number': timezone.now().weekday(),
        })
        self.assertEqual(res_administer.status_code, status.HTTP_201_CREATED)

        # 5. Doctor and Physio Notes
        res_doc = self.client.get(f"/api/patients/{self.patient_a.id}/doctor-notes/")
        self.assertEqual(res_doc.status_code, status.HTTP_200_OK)

        res_physio = self.client.get(f"/api/patients/{self.patient_a.id}/physio-notes/")
        self.assertEqual(res_physio.status_code, status.HTTP_200_OK)

        # 6. Staff portal detail endpoint
        res_portal = self.client.get(f"/api/staff-portal/patients/{self.patient_a.id}/")
        self.assertEqual(res_portal.status_code, status.HTTP_200_OK)

    def test_nurse_b_unassigned_patient_returns_404_on_all_endpoints(self):
        # Nurse B has NO bookings with Patient A
        self.client.force_authenticate(user=self.nurse_user_b)

        # 1. Patient Detail -> 404
        res = self.client.get(f"/api/patients/{self.patient_a.id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Vitals GET -> 404
        res_vitals_get = self.client.get(f"/api/patients/{self.patient_a.id}/vitals/")
        self.assertEqual(res_vitals_get.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Vitals POST for Patient A -> 404
        res_vitals_post = self.client.post("/api/patients/vitals/", {
            'patient': self.patient_a.id,
            'recorded_at': timezone.now().isoformat(),
            'blood_pressure_systolic': 130,
        })
        self.assertEqual(res_vitals_post.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Nurse Notes GET -> 404
        res_notes_get = self.client.get(f"/api/patients/{self.patient_a.id}/nurse_notes/")
        self.assertEqual(res_notes_get.status_code, status.HTTP_404_NOT_FOUND)

        # 5. Nurse Notes POST -> 404
        res_notes_post = self.client.post(f"/api/patients/{self.patient_a.id}/nurse_notes/", {
            'note': 'Unauthorized note attempt.',
        })
        self.assertEqual(res_notes_post.status_code, status.HTTP_404_NOT_FOUND)

        # 6. MAR TodaysMeds GET -> 404
        res_meds = self.client.get(f"/api/patients/{self.patient_a.id}/mar/due-today/")
        self.assertEqual(res_meds.status_code, status.HTTP_404_NOT_FOUND)

        # 7. MAR Administer POST -> 404
        res_administer = self.client.post(f"/api/patients/{self.patient_a.id}/mar/administer/", {
            'prescription_id': self.rx_a.id,
            'day_number': timezone.now().weekday(),
        })
        self.assertEqual(res_administer.status_code, status.HTTP_404_NOT_FOUND)

        # 8. Prescriptions GET -> 404
        res_prescriptions = self.client.get(f"/api/patients/{self.patient_a.id}/prescriptions/")
        self.assertEqual(res_prescriptions.status_code, status.HTTP_404_NOT_FOUND)

        # 9. Doctor & Physio Notes GET -> 404
        res_doc = self.client.get(f"/api/patients/{self.patient_a.id}/doctor-notes/")
        self.assertEqual(res_doc.status_code, status.HTTP_404_NOT_FOUND)

        res_physio = self.client.get(f"/api/patients/{self.patient_a.id}/physio-notes/")
        self.assertEqual(res_physio.status_code, status.HTTP_404_NOT_FOUND)

        # 10. Staff portal patient detail -> 404
        res_portal = self.client.get(f"/api/staff-portal/patients/{self.patient_a.id}/")
        self.assertEqual(res_portal.status_code, status.HTTP_404_NOT_FOUND)

    def test_unassigning_patient_immediately_revokes_access(self):
        self.client.force_authenticate(user=self.nurse_user_a)

        # Confirm access initially
        res_before = self.client.get(f"/api/patients/{self.patient_a.id}/")
        self.assertEqual(res_before.status_code, status.HTTP_200_OK)

        # Admin cancels or unassigns booking
        self.booking_a.status = BookingStatus.CANCELLED
        self.booking_a.save()

        # Immediate check -> now 404
        res_after = self.client.get(f"/api/patients/{self.patient_a.id}/")
        self.assertEqual(res_after.status_code, status.HTTP_404_NOT_FOUND)

    def test_other_clinical_roles_retain_unrestricted_access(self):
        # Doctor can read Patient A and Patient B
        self.client.force_authenticate(user=self.doc_user)
        res_doc_a = self.client.get(f"/api/patients/{self.patient_a.id}/")
        res_doc_b = self.client.get(f"/api/patients/{self.patient_b.id}/")
        self.assertEqual(res_doc_a.status_code, status.HTTP_200_OK)
        self.assertEqual(res_doc_b.status_code, status.HTTP_200_OK)

        # Care Manager can read Patient A and Patient B
        self.client.force_authenticate(user=self.cm_user)
        res_cm_a = self.client.get(f"/api/patients/{self.patient_a.id}/")
        res_cm_b = self.client.get(f"/api/patients/{self.patient_b.id}/")
        self.assertEqual(res_cm_a.status_code, status.HTTP_200_OK)
        self.assertEqual(res_cm_b.status_code, status.HTTP_200_OK)

    def test_shift_level_transport_overrides_staff_member_default(self):
        self.client.force_authenticate(user=self.nurse_user_a)

        # Home payload reads from shift level first
        res = self.client.get("/api/staff-portal/home/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['transport']['driver_name'], 'Shift Specific Driver')
        self.assertEqual(res.data['transport']['driver_phone'], '+923111111111')

        # Clear shift-level transport -> falls back to StaffMember defaults
        self.booking_a.transport_driver_name = ''
        self.booking_a.transport_driver_phone = ''
        self.booking_a.save()

        res_fallback = self.client.get("/api/staff-portal/home/")
        self.assertEqual(res_fallback.status_code, status.HTTP_200_OK)
        self.assertEqual(res_fallback.data['transport']['driver_name'], 'Default Van Driver')

    def test_home_version_and_updated_at_present_and_responsive_to_changes(self):
        self.client.force_authenticate(user=self.nurse_user_a)

        res1 = self.client.get("/api/staff-portal/home/")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        version1 = res1.data.get('version')
        self.assertTrue(bool(version1))
        self.assertTrue(bool(res1.data.get('updated_at')))

        # Admin renames the nurse
        self.staff_a.first_name = 'Mariam'
        self.staff_a.last_name = 'Updated'
        self.staff_a.save()

        res2 = self.client.get("/api/staff-portal/home/")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        version2 = res2.data.get('version')
        self.assertNotEqual(version1, version2)
        self.assertEqual(res2.data['staff']['name'], 'Mariam Updated')

    def test_staff_portal_patients_list_returns_only_assigned_patients(self):
        self.client.force_authenticate(user=self.nurse_user_a)

        res = self.client.get("/api/staff-portal/patients/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        patient_ids = [item['id'] for item in res.data['results']]
        self.assertIn(self.patient_a.id, patient_ids)
        self.assertNotIn(self.patient_b.id, patient_ids)

    def test_nurse_a_vs_nurse_b_mutual_scoping(self):
        """
        Confirms Nurse A can only access Patient A and Nurse B can only access Patient B.
        Cross-access returns 404 across both GET and POST.
        """
        # 1. Nurse A testing
        self.client.force_authenticate(user=self.nurse_user_a)

        # Nurse A -> Patient A (Assigned)
        res_a_get = self.client.get(f"/api/patients/{self.patient_a.id}/")
        self.assertEqual(res_a_get.status_code, status.HTTP_200_OK)
        res_a_post = self.client.post("/api/patients/vitals/", {
            'patient': self.patient_a.id,
            'recorded_at': timezone.now().isoformat(),
            'blood_pressure_systolic': 118,
            'blood_pressure_diastolic': 78,
        })
        self.assertEqual(res_a_post.status_code, status.HTTP_201_CREATED)

        # Nurse A -> Patient B (Unassigned) -> 404
        res_a_cross_get = self.client.get(f"/api/patients/{self.patient_b.id}/")
        self.assertEqual(res_a_cross_get.status_code, status.HTTP_404_NOT_FOUND)
        res_a_cross_post = self.client.post("/api/patients/vitals/", {
            'patient': self.patient_b.id,
            'recorded_at': timezone.now().isoformat(),
            'blood_pressure_systolic': 125,
        })
        self.assertEqual(res_a_cross_post.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Nurse B testing
        self.client.force_authenticate(user=self.nurse_user_b)

        # Nurse B -> Patient B (Assigned)
        res_b_get = self.client.get(f"/api/patients/{self.patient_b.id}/")
        self.assertEqual(res_b_get.status_code, status.HTTP_200_OK)
        res_b_post = self.client.post("/api/patients/vitals/", {
            'patient': self.patient_b.id,
            'recorded_at': timezone.now().isoformat(),
            'blood_pressure_systolic': 122,
            'blood_pressure_diastolic': 82,
        })
        self.assertEqual(res_b_post.status_code, status.HTTP_201_CREATED)

        # Nurse B -> Patient A (Unassigned) -> 404
        res_b_cross_get = self.client.get(f"/api/patients/{self.patient_a.id}/")
        self.assertEqual(res_b_cross_get.status_code, status.HTTP_404_NOT_FOUND)
        res_b_cross_post = self.client.post("/api/patients/vitals/", {
            'patient': self.patient_a.id,
            'recorded_at': timezone.now().isoformat(),
            'blood_pressure_systolic': 130,
        })
        self.assertEqual(res_b_cross_post.status_code, status.HTTP_404_NOT_FOUND)

    def test_mobile_app_endpoints_for_assigned_nurse(self):
        """
        Validates all endpoints invoked by the Mobile App (VisitDetail, VitalsEntry, NursesNote,
        TodaysMeds, AddPrescription, PatientDetail) for an assigned nurse.
        """
        self.client.force_authenticate(user=self.nurse_user_a)

        # 1. VisitDetail: GET /api/bookings/{id}/
        res_visit = self.client.get(f"/api/bookings/{self.booking_a.id}/")
        self.assertEqual(res_visit.status_code, status.HTTP_200_OK)
        # Booking for unassigned patient returns 404
        res_unassigned_visit = self.client.get(f"/api/bookings/{self.booking_b.id}/")
        self.assertEqual(res_unassigned_visit.status_code, status.HTTP_404_NOT_FOUND)

        # 2. VitalsEntry: POST /api/patients/vitals/
        res_vitals = self.client.post("/api/patients/vitals/", {
            'patient': self.patient_a.id,
            'recorded_at': timezone.now().isoformat(),
            'blood_pressure_systolic': 120,
            'blood_pressure_diastolic': 80,
            'heart_rate': 74,
            'spo2': 99,
        })
        self.assertEqual(res_vitals.status_code, status.HTTP_201_CREATED)

        # 3. NursesNote: POST /api/patients/{id}/nurse_notes/
        res_note = self.client.post(f"/api/patients/{self.patient_a.id}/nurse_notes/", {
            'note': 'Mobile visit observation: vitals stable, patient ambulant.',
            'booking_id': self.booking_a.id,
        })
        self.assertEqual(res_note.status_code, status.HTTP_201_CREATED)

        # 4. TodaysMeds: GET /api/patients/{id}/mar/due-today/
        res_mar = self.client.get(f"/api/patients/{self.patient_a.id}/mar/due-today/")
        self.assertEqual(res_mar.status_code, status.HTTP_200_OK)

        # 5. AddPrescription: POST /api/patients/{id}/prescriptions/
        res_rx = self.client.post(f"/api/patients/{self.patient_a.id}/prescriptions/", {
            'medication': 'Paracetamol',
            'dosage': '500mg',
            'frequency': 'TDS as needed',
            'prescribed_by': 'Dr. Alam',
            'date': timezone.now().date().isoformat(),
        })
        self.assertEqual(res_rx.status_code, status.HTTP_201_CREATED)

        # 6. PatientDetail: GET /api/patients/{id}/
        res_detail = self.client.get(f"/api/patients/{self.patient_a.id}/")
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)

    def test_all_system_roles_assigned_and_unassigned_access(self):
        """
        Tests every role across assigned and unassigned patients:
        - Doctors, Care Managers, Branch Managers, Admins, Super Admins, Physios,
          Lab Techs, Delivery Riders, Accountants, and CRM retain unrestricted access (200).
        - Field nurse roles (nurse, nursing_assistant) are restricted (404 for unassigned).
        """
        role_configs = [
            ('doc_user2', StaffRole.DOCTOR, False),
            ('cm_user2', StaffRole.CARE_MANAGER, False),
            ('bm_user', StaffRole.BRANCH_MANAGER, False),
            ('admin_user', StaffRole.ADMIN, False),
            ('physio_user', StaffRole.PHYSIO, False),
            ('lab_tech_user', StaffRole.LAB_TECH, False),
            ('rider_user', StaffRole.DELIVERY_RIDER, False),
            ('accountant_user', StaffRole.ACCOUNTANT, False),
            ('crm_user', StaffRole.CRM_EXECUTIVE, False),
        ]

        # 1. Non-nurse roles retain unrestricted GET access to both Patient A and Patient B
        for username, staff_role, is_super in role_configs:
            u, _ = User.objects.get_or_create(username=username, defaults={'email': f"{username}@test.com"})
            StaffMember.objects.get_or_create(
                employee_id=f"EMP-{username.upper()}",
                defaults={
                    'user': u,
                    'first_name': username.capitalize(),
                    'last_name': 'Test',
                    'role': staff_role,
                    'hire_date': datetime.date(2024, 1, 1),
                    'platform_allowed': 'both',
                }
            )
            self.client.force_authenticate(user=u)

            # Both Patient A and Patient B return 200
            res_a = self.client.get(f"/api/patients/{self.patient_a.id}/")
            self.assertEqual(
                res_a.status_code, status.HTTP_200_OK,
                f"Role {staff_role} failed GET patient A"
            )
            res_b = self.client.get(f"/api/patients/{self.patient_b.id}/")
            self.assertEqual(
                res_b.status_code, status.HTTP_200_OK,
                f"Role {staff_role} failed GET patient B"
            )

        # 2. Super Admin
        sa_user = User.objects.create_superuser(username='super_admin_test', password='TestPassword123!', email='sa@test.com')
        self.client.force_authenticate(user=sa_user)
        self.assertEqual(self.client.get(f"/api/patients/{self.patient_a.id}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/patients/{self.patient_b.id}/").status_code, status.HTTP_200_OK)

        # 3. Nursing Assistant (restricted like nurse)
        na_user = User.objects.create_user(username='na_zahra', password='TestPassword123!')
        StaffMember.objects.create(
            user=na_user,
            first_name='Zahra',
            last_name='Assistant',
            role='nursing_assistant',
            employee_id='NA-001',
            hire_date=datetime.date(2025, 1, 1),
            platform_allowed='both',
        )
        self.client.force_authenticate(user=na_user)
        # Unassigned to both -> 404 on both
        self.assertEqual(self.client.get(f"/api/patients/{self.patient_a.id}/").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(f"/api/patients/{self.patient_b.id}/").status_code, status.HTTP_404_NOT_FOUND)
