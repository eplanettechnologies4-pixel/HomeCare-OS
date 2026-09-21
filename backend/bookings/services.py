from datetime import datetime, date, timedelta
from django.utils import timezone
from .models import Booking, BookingStatus, ShiftFrequency

DAY_NAME_TO_INT = {
    'mon': 0, 'monday': 0,
    'tue': 1, 'tuesday': 1,
    'wed': 2, 'wednesday': 2,
    'thu': 3, 'thursday': 3,
    'fri': 4, 'friday': 4,
    'sat': 5, 'saturday': 5,
    'sun': 6, 'sunday': 6,
}


def generate_recurring_bookings(booking, recurring_days=None, end_date=None, occurrences=None):
    """
    Auto-generates recurring child bookings for a given parent booking.
    Supports:
      - shift_frequency: daily, alternate_days, twice_weekly, weekly, monthly
      - explicit recurring_days: e.g. ['Mon', 'Wed', 'Fri']
      - end_date: date boundary up to which bookings are generated
      - occurrences: limit on total visits generated (default 30, max 60)
    """
    if recurring_days is None:
        recurring_days = booking.recurring_days or []

    freq = booking.shift_frequency or ShiftFrequency.ONCE
    start_dt = booking.scheduled_time
    if not start_dt:
        start_dt = timezone.now()

    # Determine end date
    if isinstance(end_date, str) and end_date.strip():
        try:
            end_date = datetime.strptime(end_date[:10], '%Y-%m-%d').date()
        except ValueError:
            end_date = None

    if not end_date:
        if booking.recurrence_end_date:
            end_date = booking.recurrence_end_date
        else:
            # Default to 30 days window
            end_date = start_dt.date() + timedelta(days=30)

    max_count = min(int(occurrences or 30), 60)

    # Normalize recurring days set of integers (0=Monday, 6=Sunday)
    target_weekdays = set()
    for d in recurring_days:
        normalized = str(d).strip().lower()[:3]
        if normalized in DAY_NAME_TO_INT:
            target_weekdays.add(DAY_NAME_TO_INT[normalized])

    created_bookings = []
    current_date = start_dt.date() + timedelta(days=1)
    booking_time = start_dt.time()

    # If explicit target weekdays are provided, generate on matching weekdays
    if target_weekdays:
        while current_date <= end_date and len(created_bookings) < max_count:
            if current_date.weekday() in target_weekdays:
                new_scheduled_dt = timezone.make_aware(
                    datetime.combine(current_date, booking_time)
                ) if timezone.is_naive(datetime.combine(current_date, booking_time)) else datetime.combine(current_date, booking_time)

                # Avoid duplicate booking on same day
                exists = Booking.objects.filter(
                    patient=booking.patient,
                    parent_booking=booking,
                    scheduled_time__date=current_date
                ).exists()

                if not exists:
                    child = Booking.objects.create(
                        patient=booking.patient,
                        parent_booking=booking,
                        assigned_staff=booking.assigned_staff,
                        backup_staff=booking.backup_staff,
                        service_type=booking.service_type,
                        status=BookingStatus.ASSIGNED if booking.assigned_staff else BookingStatus.PENDING,
                        payment_status=booking.payment_status,
                        payment_method=booking.payment_method,
                        scheduled_time=new_scheduled_dt,
                        shift_duration=booking.shift_duration,
                        shift_frequency=booking.shift_frequency,
                        recurring_days=booking.recurring_days,
                        recurrence_end_date=end_date,
                        address=booking.address,
                        latitude=booking.latitude,
                        longitude=booking.longitude,
                        patient_dob=booking.patient_dob,
                        patient_age=booking.patient_age,
                        emergency_contact_name=booking.emergency_contact_name,
                        emergency_contact_phone=booking.emergency_contact_phone,
                        email=booking.email,
                        diagnosis=booking.diagnosis,
                        allergies=booking.allergies,
                        has_prescription=booking.has_prescription,
                        consult_doctor_needed=booking.consult_doctor_needed,
                        care_manager_name=booking.care_manager_name,
                        clinical_requirements=booking.clinical_requirements,
                        assigned_on=timezone.now() if booking.assigned_staff else None,
                        gender_preference=booking.gender_preference,
                        consultant_name=booking.consultant_name,
                        consultant_details=booking.consultant_details,
                        notes=booking.notes,
                        amount=booking.amount,
                        amount_paid=0,
                        created_by=booking.created_by,
                    )
                    created_bookings.append(child)

            current_date += timedelta(days=1)

    elif freq != ShiftFrequency.ONCE:
        # Step-based generation
        step_days = 1
        if freq == ShiftFrequency.DAILY:
            step_days = 1
        elif freq == ShiftFrequency.ALTERNATE_DAYS:
            step_days = 2
        elif freq == ShiftFrequency.TWICE_WEEKLY:
            step_days = 3
        elif freq == ShiftFrequency.WEEKLY:
            step_days = 7
        elif freq == ShiftFrequency.MONTHLY:
            step_days = 30

        while current_date <= end_date and len(created_bookings) < max_count:
            new_scheduled_dt = timezone.make_aware(
                datetime.combine(current_date, booking_time)
            ) if timezone.is_naive(datetime.combine(current_date, booking_time)) else datetime.combine(current_date, booking_time)

            exists = Booking.objects.filter(
                patient=booking.patient,
                parent_booking=booking,
                scheduled_time__date=current_date
            ).exists()

            if not exists:
                child = Booking.objects.create(
                    patient=booking.patient,
                    parent_booking=booking,
                    assigned_staff=booking.assigned_staff,
                    backup_staff=booking.backup_staff,
                    service_type=booking.service_type,
                    status=BookingStatus.ASSIGNED if booking.assigned_staff else BookingStatus.PENDING,
                    payment_status=booking.payment_status,
                    payment_method=booking.payment_method,
                    scheduled_time=new_scheduled_dt,
                    shift_duration=booking.shift_duration,
                    shift_frequency=booking.shift_frequency,
                    recurring_days=booking.recurring_days,
                    recurrence_end_date=end_date,
                    address=booking.address,
                    latitude=booking.latitude,
                    longitude=booking.longitude,
                    patient_dob=booking.patient_dob,
                    patient_age=booking.patient_age,
                    emergency_contact_name=booking.emergency_contact_name,
                    emergency_contact_phone=booking.emergency_contact_phone,
                    email=booking.email,
                    diagnosis=booking.diagnosis,
                    allergies=booking.allergies,
                    has_prescription=booking.has_prescription,
                    consult_doctor_needed=booking.consult_doctor_needed,
                    care_manager_name=booking.care_manager_name,
                    clinical_requirements=booking.clinical_requirements,
                    assigned_on=timezone.now() if booking.assigned_staff else None,
                    gender_preference=booking.gender_preference,
                    consultant_name=booking.consultant_name,
                    consultant_details=booking.consultant_details,
                    notes=booking.notes,
                    amount=booking.amount,
                    amount_paid=0,
                    created_by=booking.created_by,
                )
                created_bookings.append(child)

            current_date += timedelta(days=step_days)

    return created_bookings
