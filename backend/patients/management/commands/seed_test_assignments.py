"""
HomeCare OS — Seed Test Data Assignments Management Command
============================================================
Seeds test patients and clinician/staff assignments for QA on the live portal.
Idempotent, safe to run multiple times. Creates ONLY patients and assignments (bookings),
no clinical entries (no vitals, notes, prescriptions, MAR, or lab orders).

Usage:
    python manage.py seed_test_assignments --confirm
    python manage.py seed_test_assignments --list
"""
import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import transaction

from accounts.models import UserProfile, UserRole
from staff.models import StaffMember, StaffRole
from patients.models import Patient
from bookings.models import Booking, BookingStatus, ServiceType, ShiftDuration
from homecareOS.permissions import get_user_role, is_family_user
from patients.scoping import (
    get_assigned_patient_ids_for_clinician,
    is_clinician_user,
    is_care_manager_for_patient,
    is_treating_doctor_for_patient,
)

User = get_user_model()


TEST_STAFF_CONFIGS = [
    {
        'key': 'nurse',
        'username': 'nurse',
        'first_name': 'Nurse',
        'last_name': 'Test',
        'role': StaffRole.NURSE,
        'employee_id': 'TEST-NURSE-01',
        'specialization': 'General Nursing & Bedside Care',
    },
    {
        'key': 'doctor',
        'username': 'doctor',
        'first_name': 'Doctor',
        'last_name': 'Test',
        'role': StaffRole.DOCTOR,
        'employee_id': 'TEST-DOC-01',
        'specialization': 'Internal Medicine & Geriatrics',
    },
    {
        'key': 'physio',
        'username': 'physio',
        'first_name': 'Physio',
        'last_name': 'Test',
        'role': StaffRole.PHYSIO,
        'employee_id': 'TEST-PHY-01',
        'specialization': 'Musculoskeletal & Post-Stroke Rehab',
    },
    {
        'key': 'speech',
        'username': 'speech',
        'first_name': 'Speech',
        'last_name': 'Test',
        'role': StaffRole.SPEECH,
        'employee_id': 'TEST-SLP-01',
        'specialization': 'Dysphagia & Speech Therapy',
    },
    {
        'key': 'psych',
        'username': 'psych',
        'first_name': 'Psych',
        'last_name': 'Test',
        'role': StaffRole.PSYCHOLOGIST,
        'employee_id': 'TEST-PSY-01',
        'specialization': 'Cognitive Behavioral Therapy (CBT)',
    },
    {
        'key': 'dietician',
        'username': 'dietician',
        'first_name': 'Dietician',
        'last_name': 'Test',
        'role': StaffRole.DIETICIAN,
        'employee_id': 'TEST-DT-01',
        'specialization': 'Clinical Nutrition & Diabetic Care',
    },
    {
        'key': 'manager',
        'username': 'manager',
        'first_name': 'Manager',
        'last_name': 'Test',
        'role': StaffRole.CARE_MANAGER,
        'employee_id': 'TEST-MGR-01',
        'specialization': 'Care Coordination & Case Management',
    },
]

FAMILY_CONFIG = {
    'key': 'family',
    'username': 'family',
    'first_name': 'Family',
    'last_name': 'Test',
    'email': 'family.test@homecareos.test',
}


def resolve_or_create_test_staff(cfg, create=False):
    """
    Finds existing test user and StaffMember, or creates them if create=True.
    """
    username = cfg['username']
    first_name = cfg['first_name']
    last_name = cfg['last_name']
    role = cfg['role']
    employee_id = cfg['employee_id']

    # 1. Look up User
    user = User.objects.filter(username=username).first()
    if not user and create:
        user = User.objects.create_user(
            username=username,
            password='TestPassword123!',
            first_name=first_name,
            last_name=last_name,
            email=f"{username}@homecareos.test"
        )

    # 2. Look up StaffMember
    staff = None
    if user:
        staff = StaffMember.objects.filter(user=user).first()
    if not staff:
        staff = StaffMember.objects.filter(first_name=first_name, last_name=last_name).first()

    if not staff and create:
        staff = StaffMember.objects.create(
            user=user,
            first_name=first_name,
            last_name=last_name,
            role=role,
            employee_id=employee_id,
            hire_date=datetime.date(2025, 1, 1),
            platform_allowed='both',
            specialization=cfg.get('specialization', ''),
        )
    elif staff and create and user and staff.user_id != user.id:
        staff.user = user
        staff.save(update_fields=['user'])

    return user, staff


def resolve_or_create_family_user(create=False):
    """
    Finds existing family user, or creates if create=True.
    """
    username = FAMILY_CONFIG['username']
    user = User.objects.filter(username=username).first()
    if not user and create:
        user = User.objects.create_user(
            username=username,
            password='TestPassword123!',
            first_name=FAMILY_CONFIG['first_name'],
            last_name=FAMILY_CONFIG['last_name'],
            email=FAMILY_CONFIG['email']
        )
    if user and create:
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={'role': UserRole.PATIENT_FAMILY}
        )
        if profile.role != UserRole.PATIENT_FAMILY:
            profile.role = UserRole.PATIENT_FAMILY
            profile.save(update_fields=['role'])
    return user


def check_user_reaches_patient(user, patient):
    """
    Determines if user can reach the patient using real system scoping helpers.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    role = get_user_role(user)
    if role in ('super_admin', 'admin', 'branch_manager'):
        return True

    if is_family_user(user):
        return bool(patient.portal_user_id and patient.portal_user_id == user.id)

    if role == 'care_manager':
        return is_care_manager_for_patient(user, patient)

    if is_clinician_user(user):
        assigned_ids = get_assigned_patient_ids_for_clinician(user)
        return bool(assigned_ids is not None and patient.id in assigned_ids)

    return False


class Command(BaseCommand):
    help = 'Seeds QA test patients and clinician assignments (idempotent, no clinical records created)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            default=False,
            help='Execute changes. Without this flag, prints what WOULD be done without changing DB.',
        )
        parser.add_argument(
            '--list',
            action='store_true',
            default=False,
            help='Print accessibility table for test accounts without altering anything.',
        )

    def handle(self, *args, **options):
        confirm = options.get('confirm', False)
        list_only = options.get('list', False)

        if not confirm and not list_only:
            self.stdout.write(self.style.WARNING(
                "\n[DRY RUN] --confirm not provided. Printing actions that WOULD be performed:\n"
            ))
            self.print_dry_run_plan()
            self.stdout.write(self.style.NOTICE(
                "\nRun with '--confirm' to apply these changes:\n"
                "    python manage.py seed_test_assignments --confirm\n"
            ))
            return

        if confirm:
            self.seed_records()

        # Print the accessibility matrix table
        self.print_accessibility_matrix()

    def print_dry_run_plan(self):
        self.stdout.write("1. Test Users & Staff Profiles:")
        for cfg in TEST_STAFF_CONFIGS:
            self.stdout.write(f"   - {cfg['username']} ({cfg['role']}): StaffMember '{cfg['first_name']} {cfg['last_name']}'")
        self.stdout.write(f"   - {FAMILY_CONFIG['username']}: Patient/Family user (no StaffMember)")

        self.stdout.write("\n2. Fake Patients to Seed (Marker: 'TEST Patient *', Prefix 'TEST-'):")
        self.stdout.write("   - TEST Patient A (TEST-MR-001): Assigned to Nurse, Doctor, Manager, Physio; linked to Family user; today's visit.")
        self.stdout.write("   - TEST Patient B (TEST-MR-002): Assigned to Speech, Psych, Dietician, Manager; today's visit.")
        self.stdout.write("   - TEST Patient C (TEST-MR-003): Control patient assigned to NO ONE (404/403 for non-admins).")

        self.stdout.write("\n3. Assignments / Bookings to Seed:")
        self.stdout.write("   - Patient A: Care Manager 'Manager Test', Portal User 'family'")
        self.stdout.write("     * Booking: Nurse Test (Nursing, In Progress, today)")
        self.stdout.write("     * Booking: Doctor Test (Doctor Consultation, Assigned, today)")
        self.stdout.write("     * Booking: Physio Test (Physiotherapy, Assigned, today)")
        self.stdout.write("   - Patient B: Care Manager 'Manager Test'")
        self.stdout.write("     * Booking: Speech Test (Speech Therapy, Assigned, today)")
        self.stdout.write("     * Booking: Psych Test (Psychotherapy, Assigned, today)")
        self.stdout.write("     * Booking: Dietician Test (Dietician, Assigned, today)")
        self.stdout.write("   - Patient C: 0 bookings, 0 care managers, 0 portal users.")
        self.stdout.write("\n4. Clinical Entries:")
        self.stdout.write("   - ZERO vitals, notes, prescriptions, MAR or lab records will be created.")

    def seed_records(self):
        self.stdout.write(self.style.SUCCESS("\n[APPLYING] Seeding QA test patients and assignments...\n"))

        now = timezone.now()
        today = now.date()

        with transaction.atomic():
            # 1. Resolve / create staff members
            staff_map = {}
            user_map = {}
            for cfg in TEST_STAFF_CONFIGS:
                u, s = resolve_or_create_test_staff(cfg, create=True)
                staff_map[cfg['key']] = s
                user_map[cfg['key']] = u

            # Family user
            family_user = resolve_or_create_family_user(create=True)
            user_map['family'] = family_user

            # Since portal_user is a OneToOneField, ensure family_user is unlinked from any
            # prior non-test patient before assigning to TEST Patient A
            if family_user:
                Patient.objects.filter(portal_user=family_user).exclude(mr_number='TEST-MR-001').update(portal_user=None)

            manager_staff = staff_map['manager']

            # 2. Patient A
            patient_a, created_a = Patient.objects.get_or_create(
                mr_number='TEST-MR-001',
                defaults={
                    'patient_code': 'TEST-PT-A',
                    'first_name': 'TEST Patient',
                    'last_name': 'A',
                    'date_of_birth': datetime.date(1980, 1, 1),
                    'gender': Patient.Gender.MALE,
                    'address': 'Fake Address 123, Block A, Test City',
                    'phone': '+92-000-0000001',
                    'emergency_contact_name': 'Fake Guardian A',
                    'emergency_contact_phone': '+92-000-0000002',
                    'emergency_contact_relation': 'Brother',
                    'primary_diagnosis': 'Test Diagnosis A (Post-Op Rehabilitation)',
                    'assigned_care_manager': manager_staff,
                    'portal_user': family_user,
                    'is_active': True,
                }
            )
            # Ensure links on existing Patient A
            if not created_a:
                patient_a.assigned_care_manager = manager_staff
                patient_a.portal_user = family_user
                patient_a.full_clean()
                patient_a.save()
            else:
                patient_a.full_clean()
                patient_a.save()

            status_a = "Created" if created_a else "Updated/Verified"
            self.stdout.write(f"  {status_a} Patient: {patient_a.full_name} ({patient_a.mr_number})")

            # 3. Patient B
            patient_b, created_b = Patient.objects.get_or_create(
                mr_number='TEST-MR-002',
                defaults={
                    'patient_code': 'TEST-PT-B',
                    'first_name': 'TEST Patient',
                    'last_name': 'B',
                    'date_of_birth': datetime.date(1975, 5, 15),
                    'gender': Patient.Gender.FEMALE,
                    'address': 'Fake Address 456, Block B, Test City',
                    'phone': '+92-000-0000003',
                    'emergency_contact_name': 'Fake Guardian B',
                    'emergency_contact_phone': '+92-000-0000004',
                    'emergency_contact_relation': 'Daughter',
                    'primary_diagnosis': 'Test Diagnosis B (Speech & Cognitive Therapy)',
                    'assigned_care_manager': manager_staff,
                    'portal_user': None,
                    'is_active': True,
                }
            )
            if not created_b:
                patient_b.assigned_care_manager = manager_staff
                patient_b.portal_user = None
                patient_b.full_clean()
                patient_b.save()
            else:
                patient_b.full_clean()
                patient_b.save()

            status_b = "Created" if created_b else "Updated/Verified"
            self.stdout.write(f"  {status_b} Patient: {patient_b.full_name} ({patient_b.mr_number})")

            # 4. Patient C (Control unassigned patient)
            patient_c, created_c = Patient.objects.get_or_create(
                mr_number='TEST-MR-003',
                defaults={
                    'patient_code': 'TEST-PT-C',
                    'first_name': 'TEST Patient',
                    'last_name': 'C',
                    'date_of_birth': datetime.date(1990, 8, 20),
                    'gender': Patient.Gender.OTHER,
                    'address': 'Fake Address 789, Block C, Test City',
                    'phone': '+92-000-0000005',
                    'emergency_contact_name': 'Fake Guardian C',
                    'emergency_contact_phone': '+92-000-0000006',
                    'emergency_contact_relation': 'Friend',
                    'primary_diagnosis': 'Test Diagnosis C (Control Unassigned Record)',
                    'assigned_care_manager': None,
                    'portal_user': None,
                    'is_active': True,
                }
            )
            if not created_c:
                patient_c.assigned_care_manager = None
                patient_c.portal_user = None
                patient_c.full_clean()
                patient_c.save()
            else:
                patient_c.full_clean()
                patient_c.save()

            status_c = "Created" if created_c else "Updated/Verified"
            self.stdout.write(f"  {status_c} Patient: {patient_c.full_name} ({patient_c.mr_number})")

            # 5. Bookings for Patient A (Nurse, Doctor, Physio)
            a_bookings = [
                (staff_map['nurse'], ServiceType.NURSING, BookingStatus.IN_PROGRESS, now - datetime.timedelta(hours=1), ShiftDuration.EIGHT_HOURS, now + datetime.timedelta(hours=7)),
                (staff_map['doctor'], ServiceType.DOCTOR_CONSULTATION, BookingStatus.ASSIGNED, now + datetime.timedelta(hours=2), ShiftDuration.FOUR_HOURS, None),
                (staff_map['physio'], ServiceType.PHYSIOTHERAPY, BookingStatus.ASSIGNED, now + datetime.timedelta(hours=3), ShiftDuration.FOUR_HOURS, None),
            ]
            for staff, s_type, b_status, sched_time, duration, end_time in a_bookings:
                existing_bk = Booking.objects.filter(
                    patient=patient_a,
                    assigned_staff=staff,
                    service_type=s_type,
                ).exclude(status=BookingStatus.CANCELLED).first()

                if not existing_bk:
                    bk = Booking(
                        patient=patient_a,
                        assigned_staff=staff,
                        service_type=s_type,
                        status=b_status,
                        scheduled_time=sched_time,
                        shift_end_time=end_time,
                        shift_duration=duration,
                        address=patient_a.address,
                        amount=Decimal('0.00'),
                    )
                    bk.full_clean(exclude=['patient'])
                    bk.save()
                    self.stdout.write(f"  Created Booking: Patient A <-> {staff.full_name} ({s_type})")
                else:
                    existing_bk.status = b_status
                    existing_bk.scheduled_time = sched_time
                    existing_bk.shift_end_time = end_time
                    existing_bk.save(update_fields=['status', 'scheduled_time', 'shift_end_time'])
                    self.stdout.write(f"  Existing Booking: Patient A <-> {staff.full_name} ({existing_bk.reference_code})")

            # 6. Bookings for Patient B (Speech, Psych, Dietician)
            b_bookings = [
                (staff_map['speech'], ServiceType.SPEECH_THERAPY, BookingStatus.ASSIGNED, now + datetime.timedelta(hours=1), ShiftDuration.FOUR_HOURS),
                (staff_map['psych'], ServiceType.PSYCHOTHERAPY, BookingStatus.ASSIGNED, now + datetime.timedelta(hours=2), ShiftDuration.FOUR_HOURS),
                (staff_map['dietician'], ServiceType.DIETICIAN, BookingStatus.ASSIGNED, now + datetime.timedelta(hours=3), ShiftDuration.FOUR_HOURS),
            ]
            for staff, s_type, b_status, sched_time, duration in b_bookings:
                existing_bk = Booking.objects.filter(
                    patient=patient_b,
                    assigned_staff=staff,
                    service_type=s_type,
                ).exclude(status=BookingStatus.CANCELLED).first()

                if not existing_bk:
                    bk = Booking(
                        patient=patient_b,
                        assigned_staff=staff,
                        service_type=s_type,
                        status=b_status,
                        scheduled_time=sched_time,
                        shift_duration=duration,
                        address=patient_b.address,
                        amount=Decimal('0.00'),
                    )
                    bk.full_clean(exclude=['patient'])
                    bk.save()
                    self.stdout.write(f"  Created Booking: Patient B <-> {staff.full_name} ({s_type})")
                else:
                    existing_bk.status = b_status
                    existing_bk.scheduled_time = sched_time
                    existing_bk.save(update_fields=['status', 'scheduled_time'])
                    self.stdout.write(f"  Existing Booking: Patient B <-> {staff.full_name} ({existing_bk.reference_code})")

            self.stdout.write(self.style.SUCCESS("  Assignments committed successfully. ZERO clinical records created.\n"))

    def print_accessibility_matrix(self):
        """
        Prints the accessibility table for each test account across TEST Patients A, B, C.
        """
        patient_a = Patient.objects.filter(mr_number='TEST-MR-001').first()
        patient_b = Patient.objects.filter(mr_number='TEST-MR-002').first()
        patient_c = Patient.objects.filter(mr_number='TEST-MR-003').first()

        patients = [
            ('A', patient_a),
            ('B', patient_b),
            ('C', patient_c),
        ]

        # Accounts to check
        accounts_to_check = []
        for cfg in TEST_STAFF_CONFIGS:
            u, s = resolve_or_create_test_staff(cfg, create=False)
            accounts_to_check.append({
                'username': cfg['username'],
                'role': cfg['role'],
                'staff_name': s.full_name if s else cfg['first_name'] + ' ' + cfg['last_name'],
                'user': u,
            })

        fam_user = resolve_or_create_family_user(create=False)
        accounts_to_check.append({
            'username': FAMILY_CONFIG['username'],
            'role': 'patient_family',
            'staff_name': '-',
            'user': fam_user,
        })

        # Add admin & superadmin for completeness / verification
        admin_user = User.objects.filter(is_staff=True).first()
        if admin_user:
            accounts_to_check.append({
                'username': admin_user.username,
                'role': 'admin',
                'staff_name': '-',
                'user': admin_user,
            })

        superadmin_user = User.objects.filter(is_superuser=True).first()
        if superadmin_user and superadmin_user.id != (admin_user.id if admin_user else None):
            accounts_to_check.append({
                'username': superadmin_user.username,
                'role': 'super_admin',
                'staff_name': '-',
                'user': superadmin_user,
            })

        self.stdout.write("=" * 96)
        self.stdout.write("TEST DATA ASSIGNMENT & REACHABILITY MATRIX")
        self.stdout.write("=" * 96)
        hdr = f"{'Username':<14} | {'Role':<15} | {'Staff Name':<16} | {'Patient A':<11} | {'Patient B':<11} | {'Patient C':<11}"
        self.stdout.write(hdr)
        self.stdout.write("-" * 96)

        for acc in accounts_to_check:
            u = acc['user']
            a_reach = "YES" if (u and patient_a and check_user_reaches_patient(u, patient_a)) else "--"
            b_reach = "YES" if (u and patient_b and check_user_reaches_patient(u, patient_b)) else "--"
            c_reach = "YES" if (u and patient_c and check_user_reaches_patient(u, patient_c)) else "--"

            row = f"{acc['username']:<14} | {acc['role']:<15} | {acc['staff_name']:<16} | {a_reach:<11} | {b_reach:<11} | {c_reach:<11}"
            self.stdout.write(row)

        self.stdout.write("-" * 96)
        self.stdout.write("Note: Patient C is unassigned to all clinical and family accounts (404/403).")
        self.stdout.write("      Only system administrative roles (admin, super_admin) can reach Patient C.")
        self.stdout.write("=" * 96 + "\n")
