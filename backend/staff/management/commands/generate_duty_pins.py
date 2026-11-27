import datetime
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from bookings.models import Booking, BookingStatus
from staff.models import DutyPIN, RosterAssignment
from staff.pin_service import (
    FIELD_PIN_ROLES,
    compute_booking_window,
    ensure_pin_for_booking,
    ensure_pin_for_duty,
)


def _compute_ra_window(ra):
    s_time = ra.start_time or (ra.shift_template.start_time if ra.shift_template else datetime.time(8, 0))
    e_time = ra.end_time or (ra.shift_template.end_time if ra.shift_template else datetime.time(16, 0))
    tz = timezone.get_current_timezone()
    w_start = timezone.make_aware(datetime.datetime.combine(ra.date, s_time), tz)
    end_date = ra.date + datetime.timedelta(days=1) if e_time <= s_time else ra.date
    w_end = timezone.make_aware(datetime.datetime.combine(end_date, e_time), tz)
    return w_start, w_end


class Command(BaseCommand):
    help = (
        "Generate DutyPINs for existing future RosterAssignments and Bookings that do not "
        "already have an active PIN. Dry-run by default; pass --confirm to write."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Actually create DutyPIN records. Without this flag, only a dry-run summary is printed.',
        )

    def handle(self, *args, **options):
        confirm = options.get('confirm', False)
        now = timezone.now()
        today = timezone.localdate()

        future_ras = (
            RosterAssignment.objects.filter(
                date__gte=today,
                is_off=False,
                staff__role__in=FIELD_PIN_ROLES,
                staff__is_active=True,
            )
            .select_related('staff', 'shift_template')
            .order_by('date', 'staff_id')
        )

        ra_candidates = []
        for ra in future_ras:
            has_active = DutyPIN.objects.filter(
                roster_assignment=ra,
                staff=ra.staff,
                is_active=True,
                revoked_at__isnull=True,
            ).exists()
            if not has_active:
                ra_candidates.append(ra)

        today_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time.min))
        future_bookings = (
            Booking.objects.filter(
                scheduled_time__gte=today_start,
                assigned_staff__isnull=False,
                assigned_staff__role__in=FIELD_PIN_ROLES,
                assigned_staff__is_active=True,
            )
            .exclude(status__in=[BookingStatus.CANCELLED, BookingStatus.COMPLETED])
            .select_related('assigned_staff', 'patient')
            .order_by('scheduled_time')
        )

        booking_candidates = []
        for bk in future_bookings:
            w_start, w_end = compute_booking_window(bk)
            if w_end < now:
                continue
            has_active = DutyPIN.objects.filter(
                staff=bk.assigned_staff,
                is_active=True,
                revoked_at__isnull=True,
                window_start=w_start,
                window_end=w_end,
            ).exists()
            if not has_active:
                booking_candidates.append(bk)

        if not confirm:
            self.stdout.write(self.style.WARNING(
                f"[DRY RUN] Would generate DutyPINs for {len(ra_candidates)} future RosterAssignment(s) "
                f"and {len(booking_candidates)} future Booking(s). Past duties are never touched."
            ))
            for ra in ra_candidates[:20]:
                self.stdout.write(f"  - RosterAssignment #{ra.id}: {ra.staff.full_name} on {ra.date}")
            for bk in booking_candidates[:20]:
                self.stdout.write(f"  - Booking #{bk.id} ({bk.reference_code}): {bk.assigned_staff.full_name} @ {bk.scheduled_time}")
            self.stdout.write(self.style.NOTICE("Run with --confirm to apply."))
            return

        created_ra = 0
        created_bk = 0
        with transaction.atomic():
            for ra in ra_candidates:
                w_start, w_end = _compute_ra_window(ra)
                ensure_pin_for_duty(ra.staff, w_start, w_end, roster_assignment=ra)
                created_ra += 1
            for bk in booking_candidates:
                ensure_pin_for_booking(bk)
                created_bk += 1

        self.stdout.write(self.style.SUCCESS(
            f"[APPLIED] Generated DutyPINs for {created_ra} future RosterAssignment(s) "
            f"and {created_bk} future Booking(s)."
        ))

