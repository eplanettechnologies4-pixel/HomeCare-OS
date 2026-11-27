"""
Shared Duty-Scheduling Service (One Duty Flow)
==============================================
Single source of truth for scheduling a nurse (or roster-based therapist) duty:
- Writes/updates RosterWeek + RosterAssignment (with patients M2M, never dropping existing)
- Consumes existing pending unassigned Booking (or updates target_booking, or creates new Booking)
- Links Booking.roster_assignment -> RosterAssignment
- Writes canonical supervisor, buddy_staff, driver, driver_pickup_time + legacy fields
- Writes AuditLog and sends Notification to duty members only
- Handles unassign / booking cancellation sync (removes patient from RosterAssignment.patients)
"""
import datetime
from zoneinfo import ZoneInfo
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import AuditLog
from bookings.models import Booking, BookingStatus
from notifications.models import Notification
from patients.models import Patient
from staff.models import RosterAssignment, RosterWeek, StaffMember

ROSTER_BASED_ROLES = ('nurse', 'physio', 'speech', 'psychologist', 'dietician')

DAY_NAME_TO_INT = {
    'mon': 0, 'monday': 0, '0': 0,
    'tue': 1, 'tuesday': 1, '1': 1,
    'wed': 2, 'wednesday': 2, '2': 2,
    'thu': 3, 'thursday': 3, '3': 3,
    'fri': 4, 'friday': 4, '4': 4,
    'sat': 5, 'saturday': 5, '5': 5,
    'sun': 6, 'sunday': 6, '6': 6,
}

ROLE_TO_SERVICE_TYPES = {
    'nurse': ('nursing', 'short_service', 'long_term', 'nursing_short_term', 'nursing_long_term'),
    'physio': ('physiotherapy',),
    'speech': ('physiotherapy', 'short_service'),
    'psychologist': ('psychology',),
    'dietician': ('nutrition',),
}


def _get_local_tz():
    tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return timezone.get_current_timezone()


def _normalize_monday(d: datetime.date) -> datetime.date:
    return d - datetime.timedelta(days=d.weekday())


def _parse_time(t_val):
    if t_val is None or t_val == '':
        return None
    if isinstance(t_val, datetime.time):
        return t_val
    s = str(t_val).strip()
    for fmt in ('%H:%M', '%H:%M:%S', '%I:%M %p', '%I:%M%p'):
        try:
            return datetime.datetime.strptime(s, fmt).time()
        except ValueError:
            pass
    raise ValidationError(f"Invalid time format: {t_val}")


def _can_schedule_duty_user(user):
    from homecareOS.permissions import get_user_role
    if not user or not user.is_authenticated:
        return False
    return get_user_role(user) in ('super_admin', 'admin', 'branch_manager', 'care_manager')


def _find_consumable_pending_booking(patient, staff_role):
    """
    Match an existing pending, unassigned Booking for this patient (newest first),
    preferring one whose service_type fits the staff member's role.
    """
    pending_qs = Booking.objects.filter(
        patient=patient,
        status=BookingStatus.PENDING,
        assigned_staff__isnull=True,
    ).order_by('-created_at', '-id')

    preferred_types = ROLE_TO_SERVICE_TYPES.get(staff_role, ())
    if preferred_types:
        preferred = pending_qs.filter(service_type__in=preferred_types).first()
        if preferred:
            return preferred
    return pending_qs.first()


def _notify_duty_members(users_and_msgs):
    for user, msg, params in users_and_msgs:
        if user and getattr(user, 'is_active', True):
            Notification.objects.create(
                recipient=user,
                icon_key='calendar',
                message=msg,
                target_screen='roster',
                target_params=params or {},
            )


def _resolve_target_dates(start_date, repeat_days=None, repeat_until=None):
    if not repeat_days or not repeat_until:
        return [start_date]

    target_weekdays = set()
    for d in repeat_days:
        key = str(d).strip().lower()[:3]
        if key in DAY_NAME_TO_INT:
            target_weekdays.add(DAY_NAME_TO_INT[key])
        elif str(d).strip() in DAY_NAME_TO_INT:
            target_weekdays.add(DAY_NAME_TO_INT[str(d).strip()])

    if not target_weekdays:
        return [start_date]

    dates = [start_date]
    cur = start_date + datetime.timedelta(days=1)
    while cur <= repeat_until and len(dates) < 60:
        if cur.weekday() in target_weekdays:
            dates.append(cur)
        cur += datetime.timedelta(days=1)
    return dates


def schedule_staff_duty(
    *,
    actor,
    staff,
    patients,
    date,
    start_time,
    end_time,
    supervisor=None,
    buddy_staff=None,
    driver=None,
    driver_pickup_time=None,
    is_published=True,
    repeat_days=None,
    repeat_until=None,
    target_booking=None,
    notes='',
    check_permissions=True,
):
    """
    Shared service that creates/updates RosterWeek + RosterAssignment + linked Bookings
    in a single atomic transaction.
    """
    if check_permissions and actor is not None and not _can_schedule_duty_user(actor):
        raise PermissionDenied('You do not have permission to schedule staff duties.')

    if not staff:
        raise ValidationError({'error': 'Staff member is required.'})
    if not staff.is_active:
        raise ValidationError({'error': f'Cannot schedule duty for inactive staff member {staff.full_name}.'})
    if getattr(staff, 'lifecycle_stage', None) == 'trainee':
        raise ValidationError({'error': f'Staff member {staff.full_name} is currently a Trainee and cannot be scheduled for clinical duties.'})

    if isinstance(date, str):
        date = datetime.date.fromisoformat(date)
    if isinstance(repeat_until, str) and repeat_until.strip():
        repeat_until = datetime.date.fromisoformat(repeat_until.strip()[:10])
    elif not isinstance(repeat_until, datetime.date):
        repeat_until = None

    start_t = _parse_time(start_time)
    end_t = _parse_time(end_time)
    if not start_t or not end_t:
        raise ValidationError({'error': 'start_time and end_time are required.'})
    if start_t == end_t:
        raise ValidationError({'error': 'Shift end time cannot be identical to start time.'})

    pickup_t = _parse_time(driver_pickup_time) if driver_pickup_time else None

    if supervisor and getattr(supervisor, 'lifecycle_stage', None) == 'trainee':
        raise ValidationError({'error': f'Supervisor {supervisor.full_name} is currently a Trainee.'})
    if buddy_staff and getattr(buddy_staff, 'lifecycle_stage', None) == 'trainee':
        raise ValidationError({'error': f'Staff member {buddy_staff.full_name} is currently a Trainee and cannot be assigned as buddy staff.'})

    patient_objs = []
    for p in (patients or []):
        if isinstance(p, Patient):
            patient_objs.append(p)
        else:
            p_obj = Patient.objects.filter(pk=p).first()
            if p_obj:
                patient_objs.append(p_obj)

    local_tz = _get_local_tz()
    is_overnight = (end_t <= start_t)
    target_dates = _resolve_target_dates(date, repeat_days=repeat_days, repeat_until=repeat_until)
    shift_label = f"{start_t.strftime('%I:%M %p').lstrip('0')} - {end_t.strftime('%I:%M %p').lstrip('0')}"
    is_independent = not (supervisor or buddy_staff or driver)

    created_assignments = []
    linked_bookings = []
    max_weekly_hours = getattr(settings, 'ROSTER_MAX_WEEKLY_HOURS', 60)
    total_week_hours = 0.0
    exceeds_max_hours = False
    warning_msg = None

    with transaction.atomic():
        for shift_date in target_dates:
            start_dt = timezone.make_aware(datetime.datetime.combine(shift_date, start_t), timezone=local_tz)
            end_dt = timezone.make_aware(
                datetime.datetime.combine(
                    shift_date + (datetime.timedelta(days=1) if is_overnight else datetime.timedelta()),
                    end_t,
                ),
                timezone=local_tz,
            )

            # Existing duty on the same (staff, date, is_published) can be expanded with more patients
            # ONLY if the shift window is identical; a different overlapping time window is a conflict.
            existing_same_duty = RosterAssignment.objects.filter(
                staff=staff, date=shift_date, is_published=is_published, is_off=False
            ).first()
            is_expanding_same_shift = bool(
                existing_same_duty and existing_same_duty.start_time == start_t and existing_same_duty.end_time == end_t
            )

            # 1. Overlap check against Bookings (excluding cancelled, target_booking, and bookings already on this exact shift)
            overlap_qs = Booking.objects.filter(assigned_staff=staff).exclude(status=BookingStatus.CANCELLED)
            if target_booking:
                overlap_qs = overlap_qs.exclude(pk=target_booking.pk)
            if is_expanding_same_shift:
                overlap_qs = overlap_qs.exclude(roster_assignment=existing_same_duty)
            if overlap_qs.filter(scheduled_time__lt=end_dt, shift_end_time__gt=start_dt).exists():
                raise ValidationError({
                    'error': f'Overlapping duty conflict: {staff.full_name} already has an assigned shift during this time window on {shift_date}.'
                })

            # 2. Overlap check against other RosterAssignments
            other_assigns = RosterAssignment.objects.filter(
                staff=staff,
                is_off=False,
                date__range=[shift_date - datetime.timedelta(days=1), shift_date + datetime.timedelta(days=1)],
            )
            if is_expanding_same_shift:
                other_assigns = other_assigns.exclude(pk=existing_same_duty.pk)
            for ea in other_assigns:
                if ea.start_time and ea.end_time:
                    ea_ov = ea.end_time <= ea.start_time
                    ea_s = timezone.make_aware(datetime.datetime.combine(ea.date, ea.start_time), timezone=local_tz)
                    ea_e = timezone.make_aware(
                        datetime.datetime.combine(ea.date + (datetime.timedelta(days=1) if ea_ov else datetime.timedelta()), ea.end_time),
                        timezone=local_tz,
                    )
                    if max(start_dt, ea_s) < min(end_dt, ea_e):
                        raise ValidationError({
                            'error': f'Overlapping duty conflict: {staff.full_name} already has roster assignment {ea.shift_name} on {ea.date}.'
                        })

            # 3. Weekly hours check
            shift_hours = round((end_dt - start_dt).total_seconds() / 3600.0, 2)
            monday_date = _normalize_monday(shift_date)
            sunday_date = monday_date + datetime.timedelta(days=6)
            week_assigns = RosterAssignment.objects.filter(
                staff=staff, date__range=[monday_date, sunday_date], is_off=False
            )
            if existing_same_duty:
                week_assigns = week_assigns.exclude(pk=existing_same_duty.pk)
            current_week_hours = 0.0
            for wa in week_assigns:
                if wa.start_time and wa.end_time:
                    wa_mins = (wa.end_time.hour * 60 + wa.end_time.minute) - (wa.start_time.hour * 60 + wa.start_time.minute)
                    if wa_mins <= 0:
                        wa_mins += 24 * 60
                    current_week_hours += wa_mins / 60.0
            total_week_hours = round(current_week_hours + shift_hours, 2)
            if total_week_hours > max_weekly_hours:
                exceeds_max_hours = True
                warning_msg = f'Scheduled weekly hours ({total_week_hours}h) exceed the weekly limit of {max_weekly_hours}h.'

            roster_week, _ = RosterWeek.objects.get_or_create(
                week_start_date=monday_date,
                defaults={
                    'status': RosterWeek.Status.PUBLISHED if is_published else RosterWeek.Status.DRAFT,
                    'revision': 1,
                },
            )

            d_name = driver.full_name if driver else ''
            d_phone = driver.phone if driver else ''
            d_pickup_str = pickup_t.strftime('%I:%M %p') if pickup_t else ''
            loc_str = patient_objs[0].address if patient_objs else (existing_same_duty.location if existing_same_duty else 'Patient Home')

            assignment, _ = RosterAssignment.objects.update_or_create(
                staff=staff,
                date=shift_date,
                is_published=is_published,
                defaults={
                    'roster_week': roster_week,
                    'shift_name': shift_label,
                    'start_time': start_t,
                    'end_time': end_t,
                    'supervisor': supervisor,
                    'buddy_staff': buddy_staff,
                    'driver': driver,
                    'driver_pickup_time': pickup_t,
                    'transport_driver_name': d_name,
                    'transport_driver_phone': d_phone,
                    'transport_pickup_time': d_pickup_str,
                    'is_off': False,
                    'location': loc_str,
                },
            )
            if patient_objs:
                assignment.patients.add(*patient_objs)

            # Create / consume Booking per patient and link to RosterAssignment
            for p in patient_objs:
                booking = None
                if target_booking and target_booking.patient_id == p.id and shift_date == date:
                    booking = target_booking
                else:
                    booking = _find_consumable_pending_booking(p, staff.role)

                if booking is None:
                    svc = 'nursing' if staff.role == 'nurse' else (
                        'physiotherapy' if staff.role == 'physio' else (
                            'psychology' if staff.role == 'psychologist' else (
                                'nutrition' if staff.role == 'dietician' else 'short_service'
                            )
                        )
                    )
                    booking = Booking(
                        patient=p,
                        service_type=svc,
                        address=p.address or 'Home',
                        diagnosis=p.primary_diagnosis or '',
                    )

                booking.assigned_staff = staff
                booking.status = BookingStatus.ASSIGNED
                booking.assigned_on = timezone.now()
                booking.scheduled_time = start_dt
                booking.shift_end_time = end_dt
                booking.roster_assignment = assignment
                booking.supervisor = supervisor
                booking.buddy_staff = buddy_staff
                booking.buddy = buddy_staff  # legacy sync
                booking.driver = driver
                booking.driver_pickup_time = pickup_t
                booking.driver_name = d_name
                booking.driver_phone = d_phone
                booking.transport_driver_name = d_name
                booking.transport_driver_phone = d_phone
                booking.transport_pickup_time = d_pickup_str
                if notes:
                    booking.notes = notes
                booking.save()
                linked_bookings.append(booking)

            # Generate or reuse DutyPIN for (staff, window)
            from staff.pin_service import FIELD_PIN_ROLES, ensure_pin_for_duty
            if staff.role in FIELD_PIN_ROLES:
                pin_obj, _ = ensure_pin_for_duty(
                    staff,
                    start_dt,
                    end_dt,
                    roster_assignment=assignment,
                    booking=linked_bookings[-1] if linked_bookings else None,
                    actor=actor,
                )
            else:
                pin_obj = None

            created_assignments.append(assignment)

        # Audit entry
        actor_name = (actor.get_full_name() or actor.username) if actor else 'System'
        AuditLog.objects.create(
            actor=actor,
            actor_name=actor_name,
            action='Duty Scheduled',
            target_user=staff.full_name,
            details=(
                f"Scheduled duty for {staff.full_name} on {[d.isoformat() for d in target_dates]} ({shift_label}). "
                f"Patients: {[p.id for p in patient_objs]}. Independent: {is_independent}. Published: {is_published}."
            ),
        )

        # Notifications to duty members only
        pat_names = ', '.join(p.full_name for p in patient_objs) if patient_objs else 'Shift only'
        first_date_str = date.strftime('%b %d, %Y')
        params = {'date': date.isoformat(), 'assignment_id': created_assignments[0].id}
        notifs = []
        seen_users = set()
        if staff.user and staff.user.id not in seen_users:
            seen_users.add(staff.user.id)
            notifs.append((staff.user, f"Duty scheduled for {first_date_str} ({shift_label}) — {pat_names}.", params))
        for role_label, member in (('Supervisor', supervisor), ('Buddy', buddy_staff), ('Driver', driver)):
            if member and member.user and member.user.id not in seen_users:
                seen_users.add(member.user.id)
                notifs.append((
                    member.user,
                    f"Assigned as {role_label} for {staff.full_name} on {first_date_str} ({shift_label}).",
                    params,
                ))
        _notify_duty_members(notifs)

    return {
        'assignment': created_assignments[0],
        'assignments': created_assignments,
        'bookings': linked_bookings,
        'duty_pin': pin_obj if 'pin_obj' in locals() else None,
        'shift_hours': shift_hours,
        'total_week_hours': total_week_hours,
        'exceeds_max_hours': exceeds_max_hours,
        'warning': warning_msg,
        'is_overnight': is_overnight,
        'is_independent': is_independent,
        'shift_label': shift_label,
    }


def sync_remove_patient_from_duty(patient, *, staff=None, booking=None, actor=None, reason='Unassigned'):
    """
    Removes patient from matching RosterAssignment.patients without deleting the duty
    (leaving it as 'Shift only' if empty) and notifies affected duty staff.
    """
    local_tz = _get_local_tz()
    affected_assignments = set()

    if booking and booking.roster_assignment_id:
        ra = booking.roster_assignment
        ra.patients.remove(patient)
        affected_assignments.add(ra)
    elif staff:
        # Check if staff still has any other active booking for this patient on a given date
        ra_qs = RosterAssignment.objects.filter(
            Q(staff=staff) | Q(buddy_staff=staff),
            patients=patient,
        )
        for ra in ra_qs:
            # Keep if another non-cancelled, non-completed booking exists for (staff, patient) on ra.date
            has_other = Booking.objects.filter(
                Q(assigned_staff=staff) | Q(buddy=staff) | Q(buddy_staff=staff),
                patient=patient,
                scheduled_time__date=ra.date,
            ).exclude(status__in=[BookingStatus.CANCELLED, BookingStatus.COMPLETED])
            if booking:
                has_other = has_other.exclude(pk=booking.pk)
            if not has_other.exists():
                ra.patients.remove(patient)
                affected_assignments.add(ra)

    for ra in affected_assignments:
        if ra.staff:
            from staff.pin_service import end_patient_unlock_sessions, revoke_pin
            from staff.models import DutyPIN
            end_patient_unlock_sessions(ra.staff, patient, reason=reason, actor=actor)
            if ra.patients.count() == 0:
                for dp in DutyPIN.objects.filter(roster_assignment=ra, is_active=True, revoked_at__isnull=True):
                    revoke_pin(dp, actor=actor, reason=reason)
        if ra.staff and ra.staff.user:
            _notify_duty_members([(
                ra.staff.user,
                f"Duty updated for {ra.date.strftime('%b %d, %Y')}: {patient.full_name} removed ({reason}).",
                {'date': ra.date.isoformat(), 'assignment_id': ra.id},
            )])
    return list(affected_assignments)

