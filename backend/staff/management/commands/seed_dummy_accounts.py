"""
HomeCare OS — Seed All Dummy Accounts Management Command
========================================================
Creates or updates all dummy accounts for every role in HomeCare OS:
1. Super Admin (superadmin)
2. Admin (admin)
3. Branch Manager (branch_manager)
4. Client Care Manager (manager)
5. Treating Doctor (doctor)
6. Registered Nurse (nurse)
7. Physiotherapist (physio)
8. Speech & Language Therapist (speech)
9. Clinical Psychologist (psych)
10. Clinical Dietician (dietician)
11. Accountant (accountant)
12. CRM Executive (crm)
13. Lab Technician (lab_tech)
14. Delivery Staff / Rider (rider)
15. Patient & Family Portal User (family)

Sets standard password 'TestPassword123!' for all accounts,
ensures UserProfiles and StaffMembers with platform_allowed='both',
and links clinical assignments and published roster shifts.

Usage:
    python manage.py seed_dummy_accounts
    python manage.py seed_dummy_accounts --password CustomPass123!
"""
import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import transaction

from accounts.models import Branch, UserProfile, UserRole
from staff.models import StaffMember, StaffRole, StaffStatus, RosterWeek, RosterAssignment, ShiftTemplate
from patients.models import Patient

User = get_user_model()

DEFAULT_PASSWORD = 'TestPassword123!'

STAFF_ACCOUNTS = [
    {
        'username': 'superadmin',
        'email': 'superadmin@homecareos.com',
        'first_name': 'Super',
        'last_name': 'Admin',
        'role': 'super_admin',
        'is_superuser': True,
        'is_staff': True,
        'is_staff_member': False,
    },
    {
        'username': 'admin',
        'email': 'admin@ehealth.com',
        'first_name': 'System',
        'last_name': 'Admin',
        'role': 'admin',
        'is_superuser': False,
        'is_staff': True,
        'is_staff_member': False,
    },
    {
        'username': 'branch_manager',
        'email': 'branch.manager@homecareos.com',
        'first_name': 'Bilal',
        'last_name': 'BranchMgr',
        'role': 'branch_manager',
        'staff_role': StaffRole.BRANCH_MANAGER,
        'employee_id': 'EMP-BM-01',
        'designation': 'Branch Operations Manager',
        'specialization': 'Healthcare Facilities & Branch Operations',
        'is_staff_member': True,
    },
    {
        'username': 'manager',
        'email': 'manager@homecareos.test',
        'first_name': 'Manager',
        'last_name': 'Test',
        'role': 'care_manager',
        'staff_role': StaffRole.CARE_MANAGER,
        'employee_id': 'TEST-MGR-01',
        'designation': 'Senior Care Coordinator',
        'specialization': 'Care Coordination & Case Management',
        'is_staff_member': True,
    },
    {
        'username': 'doctor',
        'email': 'doctor@homecareos.test',
        'first_name': 'Doctor',
        'last_name': 'Test',
        'role': 'doctor',
        'staff_role': StaffRole.DOCTOR,
        'employee_id': 'TEST-DOC-01',
        'designation': 'Consultant Physician',
        'specialization': 'Internal Medicine & Geriatrics',
        'is_staff_member': True,
    },
    {
        'username': 'nurse',
        'email': 'nurse@homecareos.test',
        'first_name': 'Nurse',
        'last_name': 'Test',
        'role': 'nurse',
        'staff_role': StaffRole.NURSE,
        'employee_id': 'TEST-NURSE-01',
        'designation': 'Registered Bedside Nurse',
        'specialization': 'General Nursing & Bedside Care',
        'is_staff_member': True,
    },
    {
        'username': 'physio',
        'email': 'physio@homecareos.test',
        'first_name': 'Physio',
        'last_name': 'Test',
        'role': 'physio',
        'staff_role': StaffRole.PHYSIO,
        'employee_id': 'TEST-PHY-01',
        'designation': 'Senior Physiotherapist',
        'specialization': 'Musculoskeletal & Post-Stroke Rehab',
        'is_staff_member': True,
    },
    {
        'username': 'speech',
        'email': 'speech@homecareos.test',
        'first_name': 'Speech',
        'last_name': 'Test',
        'role': 'speech',
        'staff_role': StaffRole.SPEECH,
        'employee_id': 'TEST-SLP-01',
        'designation': 'Speech & Language Therapist',
        'specialization': 'Dysphagia & Speech Therapy',
        'is_staff_member': True,
    },
    {
        'username': 'psych',
        'email': 'psych@homecareos.test',
        'first_name': 'Psych',
        'last_name': 'Test',
        'role': 'psychologist',
        'staff_role': StaffRole.PSYCHOLOGIST,
        'employee_id': 'TEST-PSY-01',
        'designation': 'Clinical Psychologist',
        'specialization': 'Cognitive Behavioral Therapy (CBT)',
        'is_staff_member': True,
    },
    {
        'username': 'dietician',
        'email': 'dietician@homecareos.test',
        'first_name': 'Dietician',
        'last_name': 'Test',
        'role': 'dietician',
        'staff_role': StaffRole.DIETICIAN,
        'employee_id': 'TEST-DT-01',
        'designation': 'Clinical Dietician',
        'specialization': 'Clinical Nutrition & Diabetic Care',
        'is_staff_member': True,
    },
    {
        'username': 'accountant',
        'email': 'accountant@homecareos.com',
        'first_name': 'Tariq',
        'last_name': 'Accountant',
        'role': 'accountant',
        'staff_role': StaffRole.ACCOUNTANT,
        'employee_id': 'EMP-ACC-01',
        'designation': 'Senior Medical Accountant',
        'specialization': 'Clinical Billing & Invoicing',
        'is_staff_member': True,
    },
    {
        'username': 'crm',
        'email': 'crm@homecareos.com',
        'first_name': 'Ayesha',
        'last_name': 'CRM',
        'role': 'crm_executive',
        'staff_role': StaffRole.CRM_EXECUTIVE,
        'employee_id': 'EMP-CRM-01',
        'designation': 'Patient Care Representative',
        'specialization': 'Client Acquisition & Onboarding',
        'is_staff_member': True,
    },
    {
        'username': 'lab_tech',
        'email': 'lab.tech@homecareos.com',
        'first_name': 'Farhan',
        'last_name': 'LabTech',
        'role': 'lab_tech',
        'staff_role': StaffRole.LAB_TECH,
        'employee_id': 'EMP-LAB-01',
        'designation': 'Medical Laboratory Technologist',
        'specialization': 'Phlebotomy & Specimen Diagnostics',
        'is_staff_member': True,
    },
    {
        'username': 'rider',
        'email': 'rider@homecareos.com',
        'first_name': 'Kamran',
        'last_name': 'Rider',
        'role': 'delivery_rider',
        'staff_role': StaffRole.DELIVERY_RIDER,
        'employee_id': 'EMP-RIDER-01',
        'designation': 'Logistics & Dispatch Rider',
        'specialization': 'Medication & Equipment Transit',
        'is_staff_member': True,
    },
    {
        'username': 'family',
        'email': 'family@homecareos.test',
        'first_name': 'Family',
        'last_name': 'Test',
        'role': 'patient_family',
        'is_superuser': False,
        'is_staff': False,
        'is_staff_member': False,
    },
]


class Command(BaseCommand):
    help = 'Seed or update all dummy accounts across every system role with valid credentials and assignments'

    def add_arguments(self, parser):
        parser.add_argument(
            '--password',
            type=str,
            default=DEFAULT_PASSWORD,
            help=f'Password to set for all dummy accounts (default: {DEFAULT_PASSWORD})'
        )

    def handle(self, *args, **options):
        pwd = options['password']

        self.stdout.write(self.style.MIGRATE_HEADING("=== SEEDING ALL DUMMY ACCOUNTS ==="))

        with transaction.atomic():
            # 1. Branch
            branch, _ = Branch.objects.get_or_create(
                id=1,
                defaults={'name': 'Main Office', 'city': 'Islamabad', 'is_active': True}
            )

            # 2. Create or update each account
            created_accounts = []

            for acc in STAFF_ACCOUNTS:
                username = acc['username']
                email = acc['email']
                first_name = acc['first_name']
                last_name = acc['last_name']
                role = acc['role']
                is_su = acc.get('is_superuser', False)
                is_st = acc.get('is_staff', False)
                is_sm = acc.get('is_staff_member', False)

                user = User.objects.filter(username=username).first()
                if not user:
                    user = User.objects.create_user(
                        username=username,
                        email=email,
                        password=pwd,
                        first_name=first_name,
                        last_name=last_name,
                    )
                else:
                    user.email = email
                    user.first_name = first_name
                    user.last_name = last_name
                    user.set_password(pwd)

                user.is_superuser = is_su
                user.is_staff = is_st or is_su
                user.save()

                # UserProfile
                # UserProfile.role choices: super_admin, admin, branch_manager, care_manager, nurse, accountant, crm_executive, patient_family
                profile_role = role
                if profile_role in ['doctor', 'physio', 'speech', 'psychologist', 'dietician', 'lab_tech', 'delivery_rider']:
                    profile_role = UserRole.NURSE  # Clinical staff role bucket in UserProfile

                profile, _ = UserProfile.objects.get_or_create(
                    user=user,
                    defaults={'role': profile_role, 'branch': branch, 'status': 'active'}
                )
                profile.role = profile_role
                profile.branch = branch
                profile.status = 'active'
                profile.save()

                # StaffMember
                staff_member = None
                if is_sm:
                    s_role = acc['staff_role']
                    emp_id = acc['employee_id']
                    staff_member = StaffMember.objects.filter(employee_id=emp_id).first()
                    if not staff_member:
                        staff_member = StaffMember.objects.filter(user=user).first()

                    if not staff_member:
                        staff_member = StaffMember.objects.create(
                            user=user,
                            employee_id=emp_id,
                            first_name=first_name,
                            last_name=last_name,
                            role=s_role,
                            designation=acc.get('designation', ''),
                            specialization=acc.get('specialization', ''),
                            phone='+92-300-1234567',
                            email=email,
                            hire_date=datetime.date(2024, 1, 1),
                            platform_allowed='both',
                            status=StaffStatus.AVAILABLE,
                            is_active=True,
                            employment_status='trained',
                        )
                    else:
                        staff_member.user = user
                        staff_member.first_name = first_name
                        staff_member.last_name = last_name
                        staff_member.role = s_role
                        staff_member.designation = acc.get('designation', '')
                        staff_member.specialization = acc.get('specialization', '')
                        staff_member.email = email
                        staff_member.platform_allowed = 'both'
                        staff_member.is_active = True
                        if not staff_member.employment_status:
                            staff_member.employment_status = 'trained'
                        staff_member.save()

                created_accounts.append({
                    'username': username,
                    'password': pwd,
                    'role': role,
                    'name': f"{first_name} {last_name}",
                    'platform': 'both',
                })

            # 3. Ensure Published Roster Assignment for Doctor and Nurse so Smart Roster has live data
            today = timezone.now().date()
            monday = today - datetime.timedelta(days=today.weekday())
            roster_week, _ = RosterWeek.objects.get_or_create(
                week_start_date=monday,
                defaults={'status': RosterWeek.Status.PUBLISHED}
            )
            roster_week.status = RosterWeek.Status.PUBLISHED
            roster_week.save()

            doc_staff = StaffMember.objects.filter(employee_id='TEST-DOC-01').first()
            nurse_staff = StaffMember.objects.filter(employee_id='TEST-NURSE-01').first()

            for st_obj in [doc_staff, nurse_staff]:
                if st_obj:
                    assign, _ = RosterAssignment.objects.get_or_create(
                        roster_week=roster_week,
                        staff=st_obj,
                        date=today,
                        defaults={
                            'shift_name': 'Morning Clinical Duty',
                            'start_time': datetime.time(8, 0),
                            'end_time': datetime.time(16, 0),
                            'location': 'Main Hospital / Home Care Zone A',
                            'is_published': True,
                            'is_off': False,
                        }
                    )
                    assign.is_published = True
                    assign.is_off = False
                    assign.shift_name = 'Morning Clinical Duty'
                    assign.start_time = datetime.time(8, 0)
                    assign.end_time = datetime.time(16, 0)
                    assign.location = 'Main Hospital / Home Care Zone A'
                    assign.save()

        # 4. Trigger test assignments to link Patient A & Patient B to clinical roles and family
        self.stdout.write("Running seed_test_assignments...")
        call_command('seed_test_assignments', confirm=True)

        # Print output table
        self.stdout.write(self.style.SUCCESS("\nAll dummy accounts successfully created and configured!"))
        self.stdout.write("=" * 86)
        self.stdout.write(f"{'Username':<16} | {'Password':<16} | {'Role':<18} | {'Display Name':<20} | {'Platform'}")
        self.stdout.write("-" * 86)
        for a in created_accounts:
            self.stdout.write(f"{a['username']:<16} | {a['password']:<16} | {a['role']:<18} | {a['name']:<20} | {a['platform']}")
        self.stdout.write("=" * 86)
        self.stdout.write(f"\nPassword for all dummy accounts: {pwd}\n")
