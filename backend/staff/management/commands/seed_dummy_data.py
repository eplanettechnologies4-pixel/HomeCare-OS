"""
HomeCare OS — Seed Dummy Data Management Command
Populates database with 5 dummy staff members, 5 dummy patients, and ensures superadmin account exists.
Usage:
    python manage.py seed_dummy_data
"""
from datetime import date
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from staff.models import StaffMember
from patients.models import Patient

User = get_user_model()

STAFF_DATA = [
    {
        'username': 'nurse_sana',
        'email': 'sana.q@homecareos.com',
        'first_name': 'Sana',
        'last_name': 'Qureshi',
        'employee_id': 'EMP009',
        'role': 'nurse',
        'specialization': 'Critical Care & ICU Step-Down',
        'status': 'available',
        'phone': '+92-300-9012345',
        'rating': 4.8,
        'hire_date': date(2023, 6, 1),
        'platform_allowed': 'both',
    },
    {
        'username': 'dr_bilal',
        'email': 'bilal.a@homecareos.com',
        'first_name': 'Bilal',
        'last_name': 'Ahmed',
        'employee_id': 'EMP010',
        'role': 'doctor',
        'specialization': 'Cardiology & Hypertension Mgmt',
        'status': 'on_visit',
        'phone': '+92-300-0123456',
        'rating': 4.9,
        'hire_date': date(2020, 5, 15),
        'platform_allowed': 'both',
    },
    {
        'username': 'nurse_mariam_s',
        'email': 'mariam.s@homecareos.com',
        'first_name': 'Mariam',
        'last_name': 'Sheikh',
        'employee_id': 'EMP011',
        'role': 'nurse',
        'specialization': 'Pediatric & Maternal Care',
        'status': 'on_leave',
        'phone': '+92-301-1234567',
        'rating': 4.6,
        'hire_date': date(2024, 1, 10),
        'platform_allowed': 'both',
    },
    {
        'username': 'physio_ali',
        'email': 'ali.r@homecareos.com',
        'first_name': 'Ali',
        'last_name': 'Rizvi',
        'employee_id': 'EMP012',
        'role': 'physio',
        'specialization': 'Neurological Rehab & Stroke Rec',
        'status': 'available',
        'phone': '+92-301-2345678',
        'rating': 4.7,
        'hire_date': date(2022, 11, 20),
        'platform_allowed': 'both',
    },
    {
        'username': 'caremgr_nadia',
        'email': 'nadia.r@homecareos.com',
        'first_name': 'Nadia',
        'last_name': 'Rehman',
        'employee_id': 'EMP013',
        'role': 'care_manager',
        'specialization': 'Oncology & Palliative Coordination',
        'status': 'available',
        'phone': '+92-301-3456789',
        'rating': 4.8,
        'hire_date': date(2021, 9, 5),
        'platform_allowed': 'both',
    },
]

PATIENTS_DATA = [
    {
        'mr_number': 'MR-2024-007',
        'first_name': 'Tariq',
        'last_name': 'Mahmood',
        'date_of_birth': date(1956, 7, 22),
        'gender': 'M',
        'primary_diagnosis': 'Hypertensive Heart Disease + Stage 3 CKD',
        'phone': '+92-51-111-0007',
        'address': 'House 33, Street 7, G-10/1, Islamabad',
        'latitude': 33.5680,
        'longitude': 73.1445,
        'allergies': 'NSAIDs',
        'blood_type': 'B-',
        'emergency_contact_name': 'Asim Mahmood',
        'emergency_contact_phone': '+92-300-9911111',
    },
    {
        'mr_number': 'MR-2024-008',
        'first_name': 'Saira',
        'last_name': 'Bano',
        'date_of_birth': date(1990, 11, 5),
        'gender': 'F',
        'primary_diagnosis': 'Breast Cancer Post-Chemotherapy Recovery',
        'phone': '+92-51-111-0008',
        'address': 'Plot 22, F-7 Markaz, Islamabad',
        'latitude': 33.7197,
        'longitude': 73.0588,
        'allergies': 'Morphine (nausea)',
        'blood_type': 'O+',
        'emergency_contact_name': 'Kashif Bano',
        'emergency_contact_phone': '+92-300-8822222',
    },
    {
        'mr_number': 'MR-2024-009',
        'first_name': 'Abdul',
        'last_name': 'Rehman',
        'date_of_birth': date(1948, 3, 14),
        'gender': 'M',
        'primary_diagnosis': "Parkinson's Disease Stage IV + Dysphagia",
        'phone': '+92-51-111-0009',
        'address': 'House 5, Street 2, I-8/3, Islamabad',
        'latitude': 33.6844,
        'longitude': 73.0479,
        'allergies': 'Haloperidol',
        'blood_type': 'A+',
        'emergency_contact_name': 'Farida Rehman',
        'emergency_contact_phone': '+92-300-7733333',
    },
    {
        'mr_number': 'MR-2024-010',
        'first_name': 'Zainab',
        'last_name': 'Mirza',
        'date_of_birth': date(1996, 8, 18),
        'gender': 'F',
        'primary_diagnosis': 'Lupus (SLE) — Active Flare Management',
        'phone': '+92-51-111-0010',
        'address': 'Flat 4B, Margalla Heights, E-11, Islamabad',
        'latitude': 33.7003,
        'longitude': 73.0259,
        'allergies': 'NKDA',
        'blood_type': 'AB-',
        'emergency_contact_name': 'Umar Mirza',
        'emergency_contact_phone': '+92-300-6644444',
    },
    {
        'mr_number': 'MR-2024-011',
        'first_name': 'Ghulam',
        'last_name': 'Mustafa',
        'date_of_birth': date(1941, 5, 30),
        'gender': 'M',
        'primary_diagnosis': 'Hip Fracture Post-ORIF — Long-Term Home Nursing',
        'phone': '+92-51-111-0011',
        'address': 'House 9, Street 1, G-6/2, Islamabad',
        'latitude': 33.7207,
        'longitude': 73.0650,
        'allergies': 'Codeine',
        'blood_type': 'B+',
        'emergency_contact_name': 'Faisal Mustafa',
        'emergency_contact_phone': '+92-300-5555555',
    },
]


class Command(BaseCommand):
    help = 'Seed database with dummy staff and patient records'

    def handle(self, *args, **options):
        # 1. Ensure Super Admin
        sa, created = User.objects.get_or_create(username='superadmin', defaults={
            'email': 'superadmin@homecareos.com',
            'first_name': 'Super',
            'last_name': 'Admin',
            'is_staff': True,
            'is_superuser': True,
        })
        sa.set_password('Admin@1234')
        sa.is_staff = True
        sa.is_superuser = True
        sa.save()
        self.stdout.write(self.style.SUCCESS(f"Super Admin ready: superadmin / Admin@1234"))

        # 2. Seed Staff Members
        care_mgr = None
        for item in STAFF_DATA:
            u, _ = User.objects.get_or_create(username=item['username'], defaults={
                'email': item['email'],
                'first_name': item['first_name'],
                'last_name': item['last_name'],
            })
            u.set_password('Staff@1234')
            u.save()

            sm, sm_created = StaffMember.objects.get_or_create(
                employee_id=item['employee_id'],
                defaults={
                    'user': u,
                    'first_name': item['first_name'],
                    'last_name': item['last_name'],
                    'role': item['role'],
                    'specialization': item['specialization'],
                    'status': item['status'],
                    'phone': item['phone'],
                    'email': item['email'],
                    'rating': item['rating'],
                    'hire_date': item['hire_date'],
                    'platform_allowed': item['platform_allowed'],
                    'is_active': True,
                }
            )
            if not sm_created:
                sm.user = u
                sm.first_name = item['first_name']
                sm.last_name = item['last_name']
                sm.role = item['role']
                sm.specialization = item['specialization']
                sm.status = item['status']
                sm.phone = item['phone']
                sm.email = item['email']
                sm.rating = item['rating']
                sm.hire_date = item['hire_date']
                sm.platform_allowed = item['platform_allowed']
                sm.save()

            if item['role'] == 'care_manager':
                care_mgr = sm

            self.stdout.write(f"  Staff: {sm.full_name} ({sm.employee_id}) - {sm.role}")

        # 3. Seed Patients
        for pdata in PATIENTS_DATA:
            p, p_created = Patient.objects.get_or_create(
                mr_number=pdata['mr_number'],
                defaults={
                    **pdata,
                    'assigned_care_manager': care_mgr,
                    'is_active': True,
                }
            )
            if not p_created:
                for k, v in pdata.items():
                    setattr(p, k, v)
                p.assigned_care_manager = care_mgr
                p.save()

            self.stdout.write(f"  Patient: {p.full_name} ({p.mr_number})")

        self.stdout.write(self.style.SUCCESS("Database dummy data seeding completed successfully!"))
