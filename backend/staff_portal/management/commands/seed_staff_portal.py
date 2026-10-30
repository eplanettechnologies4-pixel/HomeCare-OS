import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from staff.models import StaffMember, AttendanceRecord, LeaveRequest
from patients.models import Patient, VitalSign, NurseNote, Prescription
from bookings.models import Booking, BookingStatus, ServiceType, ShiftDuration
from staff_portal.models import (
    CompanyPolicy, PolicyAcknowledgement, StaffRequest,
    OvertimeClaim, Complaint, ResignationRequest, FamilyConcern
)

User = get_user_model()


class Command(BaseCommand):
    help = 'Seeds initial data for Staff / Nurses Portal (safe to run multiple times)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dev',
            action='store_true',
            default=False,
            help='Seed sample development accounts and demo records. (Defaults to OFF; DO NOT USE IN PRODUCTION)',
        )

    def handle(self, *args, **options):
        self.stdout.write("--- Seeding Staff Portal Data ---")

        # 1. Company Policies (Standard organizational clinical policies)
        policies_data = [
            {
                'title': 'Clinical Hand Hygiene & Infection Prevention',
                'slug': 'hand-hygiene-infection-prevention',
                'category': 'Clinical Standards',
                'version': '2.1',
                'summary': 'Standard operating procedures for aseptic non-touch technique (ANTT) and 5 moments of hand hygiene.',
                'content': (
                    "All clinical care staff must perform hand hygiene before touching a patient, "
                    "before clean/aseptic procedures, after body fluid exposure risk, after touching a patient, "
                    "and after touching patient surroundings. Personal Protective Equipment (PPE) must be disposed of safely."
                ),
            },
            {
                'title': 'Medication Administration & MAR Double-Check Protocol',
                'slug': 'medication-administration-mar-protocol',
                'category': 'Medication Safety',
                'version': '1.4',
                'summary': 'Mandatory 5 Rights of Medication Administration and electronic MAR verification.',
                'content': (
                    "Verify the 5 Rights: Right Patient, Right Drug, Right Dose, Right Route, and Right Time. "
                    "High-alert medications (Insulin, Heparin, Opioids) require independent double-check. "
                    "Every dose administered must be ticked in the MAR system immediately upon delivery."
                ),
            },
            {
                'title': 'Patient Dignity, Privacy & Confidentiality (HIPAA/PHI)',
                'slug': 'patient-dignity-privacy-phi',
                'category': 'Code of Conduct',
                'version': '1.0',
                'summary': 'Confidentiality of Protected Health Information (PHI) and professional bedside conduct.',
                'content': (
                    "Patient health records and home addresses are strictly confidential. Staff must never share or photograph "
                    "identifiable patient information on personal devices. Respect patient modesty and family privacy at all times."
                ),
            },
            {
                'title': 'Emergency Clinical Escalation & SOS Procedures',
                'slug': 'emergency-clinical-escalation-sos',
                'category': 'Safety & Crisis',
                'version': '3.0',
                'summary': 'Protocol for acute patient deterioration, sudden arrest, or environmental emergency.',
                'content': (
                    "In the event of acute clinical deterioration (SPO2 < 85%, severe bradycardia, unresponsiveness), "
                    "initiate BLS protocols immediately and trigger the SOS emergency hotline in the app. "
                    "Notify the assigned Care Coordinator and family guardian immediately."
                ),
            },
        ]

        for p_data in policies_data:
            policy, created = CompanyPolicy.objects.update_or_create(
                slug=p_data['slug'],
                defaults=p_data
            )
            status_text = "Created" if created else "Updated"
            self.stdout.write(f"  {status_text} Policy: {policy.title}")

        if not options.get('dev'):
            self.stdout.write("  Notice: --dev flag not passed. Skipping creation of sample development accounts & dummy records.")
            self.stdout.write("--- Staff Portal Policy Seeding Complete (Production Safe) ---")
            return

        import os
        dev_password = os.environ.get('DEV_TEST_PASSWORD')
        if not dev_password:
            self.stdout.write(self.style.ERROR(
                "Error: DEV_TEST_PASSWORD environment variable is not set.\n"
                "Please set DEV_TEST_PASSWORD before running --dev seeding."
            ))
            return

        # 2. Ensure Nurse User (Mariam Sheikh)
        nurse_user, _ = User.objects.get_or_create(username='nurse_mariam_s', defaults={'email': 'mariam.s@homecareos.com'})
        nurse_user.set_password(dev_password)
        nurse_user.first_name = 'Mariam'
        nurse_user.last_name = 'Sheikh'
        nurse_user.is_staff = False
        nurse_user.save()

        supervisor_user, _ = User.objects.get_or_create(username='supervisor_hina', defaults={'email': 'hina.m@homecareos.com'})
        supervisor_user.set_password(dev_password)
        supervisor_user.first_name = 'Hina'
        supervisor_user.last_name = 'Malik'
        supervisor_user.is_staff = True
        supervisor_user.save()

        # Staff profile
        nurse_staff, _ = StaffMember.objects.get_or_create(
            user=nurse_user,
            defaults={
                'first_name': 'Mariam',
                'last_name': 'Sheikh',
                'role': 'nurse',
                'designation': 'Registered Nurse (RN)',
                'employee_id': 'EMP011',
                'platform_allowed': 'both',
                'status': 'available',
                'phone': '+92-300-5551234',
                'hire_date': timezone.now().date() - datetime.timedelta(days=365),
            }
        )
        nurse_staff.platform_allowed = 'both'
        nurse_staff.designation = 'Registered Nurse (RN)'
        nurse_staff.save()

        supervisor_staff, _ = StaffMember.objects.get_or_create(
            user=supervisor_user,
            defaults={
                'first_name': 'Hina',
                'last_name': 'Malik',
                'role': 'care_manager',
                'designation': 'Care Coordinator Lead',
                'employee_id': 'EMP002',
                'platform_allowed': 'both',
                'status': 'available',
                'phone': '+92-300-8889999',
                'hire_date': timezone.now().date() - datetime.timedelta(days=700),
            }
        )

        # 3. Patient
        patient, _ = Patient.objects.get_or_create(
            mr_number='MR-8801',
            defaults={
                'first_name': 'Zainab',
                'last_name': 'Bibi',
                'date_of_birth': datetime.date(1948, 5, 12),
                'gender': 'F',
                'patient_code': 'PT-8801',
                'primary_diagnosis': 'Post-CVA hemiparesis, Type 2 Diabetes, Hypertension',
                'address': 'House 42, Street 7, Sector F-8/3, Islamabad',
                'assigned_care_manager': supervisor_staff,
            }
        )
        patient.patient_code = 'PT-8801'
        patient.save()

        now = timezone.now()

        # 4. Active Shift Booking (Night Shift / Long term care)
        shift_start = now - datetime.timedelta(hours=3)
        shift_end = shift_start + datetime.timedelta(hours=12)

        booking, _ = Booking.objects.get_or_create(
            reference_code='BK-2026-NURSE-01',
            defaults={
                'patient': patient,
                'assigned_staff': nurse_staff,
                'supervisor': supervisor_staff,
                'service_type': ServiceType.LONG_TERM,
                'status': BookingStatus.IN_PROGRESS,
                'scheduled_time': shift_start,
                'shift_end_time': shift_end,
                'shift_type': 'Night Shift (12 Hours)',
                'shift_duration': ShiftDuration.TWELVE_HOURS,
                'break_minutes': 45,
                'driver_name': 'Nadeem Khan',
                'driver_phone': '+92-333-7771234',
                'pickup_time': shift_start - datetime.timedelta(minutes=45),
                'handover_notes': 'Day nurse noted mild lethargy post-lunch. Blood glucose checked at 4 PM was 142 mg/dL. Evening meds due at 9 PM.',
                'address': patient.address,
                'diagnosis': patient.primary_diagnosis,
            }
        )
        # Update shift timings so it's actively running
        booking.scheduled_time = shift_start
        booking.shift_end_time = shift_end
        booking.status = BookingStatus.IN_PROGRESS
        booking.assigned_staff = nurse_staff
        booking.supervisor = supervisor_staff
        booking.save()

        # 5. Vitals with an abnormal alert & fluid intake
        VitalSign.objects.get_or_create(
            patient=patient,
            recorded_at=now - datetime.timedelta(hours=1),
            defaults={
                'recorded_by': nurse_staff,
                'booking': booking,
                'blood_pressure_systolic': 155,
                'blood_pressure_diastolic': 98,
                'heart_rate': 104,
                'temperature': Decimal('37.2'),
                'spo2': 90,
                'respiratory_rate': 22,
                'intake_ml': 350,
                'output_ml': 280,
                'notes': 'Patient reports mild shortness of breath on exertion. Elevated systolic and low SpO2.',
            }
        )

        # 6. Attendance record for overtime derivation
        yesterday = now.date() - datetime.timedelta(days=1)
        AttendanceRecord.objects.get_or_create(
            staff=nurse_staff,
            date=yesterday,
            defaults={
                'check_in': timezone.make_aware(datetime.datetime.combine(yesterday, datetime.time(7, 45))),
                'check_out': timezone.make_aware(datetime.datetime.combine(yesterday, datetime.time(21, 15))),
                'total_hours': Decimal('13.50'),
                'overtime_hours': Decimal('1.50'),
                'visits_completed': 1,
                'notes': 'Extended handover and post-shift clinical documentation.',
            }
        )

        # 7. Open Family Concern
        FamilyConcern.objects.get_or_create(
            patient=patient,
            chart_type='vitals',
            defaults={
                'raised_by': supervisor_user,
                'message': 'Guardian noticed fluctuating oxygen levels in late evening. Please verify O2 concentrator settings.',
                'status': FamilyConcern.Status.OPEN,
            }
        )

        # 8. Sample Request
        StaffRequest.objects.get_or_create(
            staff=nurse_staff,
            patient=patient,
            request_type=StaffRequest.RequestType.SUPERVISOR_VISIT,
            defaults={
                'booking': booking,
                'urgency': StaffRequest.Urgency.URGENT,
                'notes': 'Clinical review requested due to elevated blood pressure (155/98) and SpO2 at 90%.',
                'status': StaffRequest.Status.PENDING,
            }
        )

        self.stdout.write(self.style.SUCCESS("Staff Portal seeding completed successfully."))
