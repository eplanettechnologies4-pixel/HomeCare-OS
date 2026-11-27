"""
Read-only reconciliation report for duty <-> booking consistency.
Never modifies any database rows; refuses any write flag.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Q

from bookings.models import Booking, BookingStatus
from staff.models import RosterAssignment, StaffRole


class Command(BaseCommand):
    help = 'Read-only report comparing RosterAssignments and Bookings.'

    def add_arguments(self, parser):
        parser.add_argument('--fix', action='store_true', default=False, help='Forbidden (read-only command).')
        parser.add_argument('--write', action='store_true', default=False, help='Forbidden (read-only command).')

    def handle(self, *args, **options):
        if options.get('fix') or options.get('write'):
            raise CommandError('reconcile_duty_bookings is strictly read-only and refuses write flags.')

        # 1. Pending Bookings that duplicate an assigned Booking for the same patient
        assigned_patient_ids = set(
            Booking.objects.filter(
                status__in=[BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS, BookingStatus.EN_ROUTE]
            ).values_list('patient_id', flat=True)
        )
        dup_pending = Booking.objects.filter(
            status=BookingStatus.PENDING,
            patient_id__in=assigned_patient_ids,
        ).select_related('patient')

        # 2. RosterAssignments with patients but no linked Booking
        ras_with_patients = RosterAssignment.objects.annotate(
            p_count=Count('patients'),
            b_count=Count('bookings'),
        ).filter(p_count__gt=0, b_count=0).select_related('staff')

        # 3. Bookings assigned to a nurse with no published duty on their date
        nurse_bookings = Booking.objects.filter(
            assigned_staff__role=StaffRole.NURSE,
            assigned_staff__isnull=False,
        ).exclude(status__in=[BookingStatus.CANCELLED, BookingStatus.COMPLETED]).select_related('assigned_staff', 'patient')

        orphan_nurse_bookings = []
        for b in nurse_bookings:
            if not b.scheduled_time:
                continue
            b_date = b.scheduled_time.date()
            has_duty = RosterAssignment.objects.filter(
                staff=b.assigned_staff,
                date=b_date,
                is_published=True,
                is_off=False,
            ).exists()
            if not has_duty:
                orphan_nurse_bookings.append(b)

        # 4. Published duties with zero patients
        empty_published_duties = RosterAssignment.objects.filter(
            is_published=True,
            is_off=False,
        ).annotate(p_count=Count('patients')).filter(p_count=0).select_related('staff')

        self.stdout.write("=== DUTY / BOOKING RECONCILIATION REPORT (READ-ONLY) ===")
        self.stdout.write(f"1. Duplicate pending Bookings (patient already has assigned booking): {dup_pending.count()}")
        for b in dup_pending[:20]:
            self.stdout.write(f"   - Booking #{b.id} ({b.reference_code}) for {b.patient.full_name}")

        self.stdout.write(f"2. RosterAssignments with patients but no linked Booking: {ras_with_patients.count()}")
        for ra in ras_with_patients[:20]:
            self.stdout.write(f"   - RosterAssignment #{ra.id} ({ra.staff.full_name} on {ra.date})")

        self.stdout.write(f"3. Active nurse Bookings with no published duty on their date: {len(orphan_nurse_bookings)}")
        for b in orphan_nurse_bookings[:20]:
            self.stdout.write(f"   - Booking #{b.id} ({b.assigned_staff.full_name} -> {b.patient.full_name} on {b.scheduled_time.date()})")

        self.stdout.write(f"4. Published duties with zero patients (Shift only): {empty_published_duties.count()}")
        for ra in empty_published_duties[:20]:
            self.stdout.write(f"   - RosterAssignment #{ra.id} ({ra.staff.full_name} on {ra.date}: {ra.shift_name})")

