"""
HomeCare OS — Assigned Patient Scoping Helper
==============================================
Enforces strict patient access control for field staff nurses.
A nurse may only read or write clinical records (vitals, MAR, notes, prescriptions,
labs, care plans, checklists) for patients with an active, upcoming, or recent
non-cancelled booking (within settings.NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT days).

Any attempt to access an unassigned patient raises Http404 (404 Not Found).
All other clinical roles (doctors, care managers, admins, physios) retain their standard permissions.
"""
import datetime
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from django.http import Http404
from rest_framework.exceptions import NotFound


def is_field_nurse_user(user):
    """
    Returns True if the authenticated user has a field staff nurse role.
    Checks user role hierarchy: superuser/staff bypass, user profile, and staff member role.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return False

    from homecareOS.permissions import get_user_role
    role = get_user_role(user)
    if role in ('nurse', 'nursing_assistant'):
        return True

    staff = getattr(user, 'staffmember', None)
    if staff and staff.role in ('nurse', 'nursing_assistant'):
        return True

    return False


def get_assigned_patient_ids_for_user(user, now=None):
    """
    Returns a set of patient IDs assigned to the user via a non-cancelled Booking.
    Window: current, upcoming, or ended within NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT days (default 7).
    If the user is NOT a field nurse, returns None (unrestricted).
    """
    if not is_field_nurse_user(user):
        return None  # Unrestricted for doctors, care managers, admins, physios, etc.

    staff = getattr(user, 'staffmember', None)
    if not staff:
        return set()

    if now is None:
        now = timezone.now()

    days = getattr(settings, 'NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT', 7)
    cutoff = now - datetime.timedelta(days=days)

    from bookings.models import Booking, BookingStatus

    assigned_qs = Booking.objects.filter(
        Q(assigned_staff=staff) | Q(buddy=staff) | Q(buddy_staff=staff)
    ).exclude(
        status=BookingStatus.CANCELLED
    ).filter(
        Q(shift_end_time__isnull=False, shift_end_time__gte=cutoff) |
        Q(shift_end_time__isnull=True, scheduled_time__gte=cutoff)
    )

    return set(assigned_qs.values_list('patient_id', flat=True))


def check_nurse_patient_access(user, patient_id_or_obj, now=None):
    """
    Enforces assigned-patient access.
    Raises Http404 if the user is a field nurse and the patient is not assigned.
    Returns True if access is allowed.
    """
    assigned_ids = get_assigned_patient_ids_for_user(user, now=now)
    if assigned_ids is None:
        return True  # Role is not restricted to assigned patients

    if patient_id_or_obj is None:
        raise Http404("Patient not found.")

    if hasattr(patient_id_or_obj, 'id'):
        pid = patient_id_or_obj.id
    elif hasattr(patient_id_or_obj, 'pk'):
        pid = patient_id_or_obj.pk
    else:
        try:
            pid = int(patient_id_or_obj)
        except (ValueError, TypeError):
            raise Http404("Patient not found.")

    if pid not in assigned_ids:
        raise Http404("Patient not found.")

    return True


def filter_queryset_for_nurse(qs, user, patient_field='patient', now=None):
    """
    Filters a QuerySet to assigned patients if the user is a nurse.
    If patient_field is None or '', filters by pk__in (i.e. queryset is Patient.objects).
    """
    assigned_ids = get_assigned_patient_ids_for_user(user, now=now)
    if assigned_ids is None:
        return qs

    if not patient_field:
        return qs.filter(id__in=assigned_ids)

    return qs.filter(**{f"{patient_field}_id__in": assigned_ids})


# ── Clinician Portal Shared Scoping (Phase 1) ─────────────────────────────────

CLINICAL_ROLES = (
    'nurse', 'nursing_assistant',
    'doctor',
    'physio', 'physiotherapist',
    'speech', 'speech_therapist',
    'psychologist', 'psychotherapist'
)


def is_clinician_user(user):
    """
    Returns True if user has one of the clinical roles:
    doctor, physiotherapist/physio, speech_therapist/speech, psychotherapist/psychologist, nurse/assistant.
    Admins, superusers, and care managers are NOT restricted by clinician scoping.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return False

    from homecareOS.permissions import get_user_role
    role = get_user_role(user)
    if role in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
        return False

    if role in CLINICAL_ROLES:
        return True

    staff = getattr(user, 'staffmember', None)
    if staff and staff.role in CLINICAL_ROLES:
        return True

    return False


def get_assigned_patient_ids_for_clinician(user, now=None):
    """
    Returns assigned patient IDs for any clinician role via active, upcoming, or recent bookings
    (within settings.NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT days).
    Returns None if unrestricted (super_admin, admin, care_manager).
    """
    if not is_clinician_user(user):
        return None

    staff = getattr(user, 'staffmember', None)
    if not staff:
        return set()

    if now is None:
        now = timezone.now()

    days = getattr(settings, 'NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT', 7)
    cutoff = now - datetime.timedelta(days=days)

    from bookings.models import Booking, BookingStatus

    assigned_qs = Booking.objects.filter(
        Q(assigned_staff=staff) | Q(buddy=staff) | Q(buddy_staff=staff)
    ).exclude(
        status=BookingStatus.CANCELLED
    ).filter(
        Q(shift_end_time__isnull=False, shift_end_time__gte=cutoff) |
        Q(shift_end_time__isnull=True, scheduled_time__gte=cutoff)
    )

    assigned_ids = set(assigned_qs.values_list('patient_id', flat=True))

    from patients.models import Patient
    managed_ids = set(Patient.objects.filter(assigned_care_manager=staff).values_list('id', flat=True))
    assigned_ids.update(managed_ids)

    return assigned_ids


def check_clinician_patient_access(user, patient_id_or_obj, now=None):
    """
    Enforces assigned-patient access for all clinical roles (doctor, physio, speech, psychotherapist, nurse).
    Raises Http404 ("Patient not found.") if unassigned.
    Returns True if access is allowed.
    """
    assigned_ids = get_assigned_patient_ids_for_clinician(user, now=now)
    if assigned_ids is None:
        return True  # Unrestricted role

    if patient_id_or_obj is None:
        raise Http404("Patient not found.")

    if hasattr(patient_id_or_obj, 'id'):
        pid = patient_id_or_obj.id
    elif hasattr(patient_id_or_obj, 'pk'):
        pid = patient_id_or_obj.pk
    else:
        try:
            pid = int(patient_id_or_obj)
        except (ValueError, TypeError):
            raise Http404("Patient not found.")

    if pid not in assigned_ids:
        raise Http404("Patient not found.")

    return True


def filter_queryset_for_clinician(qs, user, patient_field='patient', now=None):
    """
    Filters a queryset to assigned patients for clinicians.
    """
    assigned_ids = get_assigned_patient_ids_for_clinician(user, now=now)
    if assigned_ids is None:
        return qs

    if not patient_field:
        return qs.filter(id__in=assigned_ids)

    return qs.filter(**{f"{patient_field}_id__in": assigned_ids})


def is_treating_doctor_for_patient(user, patient, now=None):
    """
    Defines the 'treating doctor' for a patient:
    A user linked to an active StaffMember with role 'doctor' who has at least one
    active, scheduled, in-progress, or recent non-cancelled Booking for this patient
    within settings.CLINICIAN_PATIENT_ACCESS_DAYS_AFTER_VISIT days (default: 7 days).
    Old bookings beyond this window do NOT confer treating doctor status.
    """
    if not user or not user.is_authenticated:
        return False

    staff = getattr(user, 'staffmember', None)
    if not staff or staff.role != 'doctor':
        return False

    if now is None:
        now = timezone.now()

    days = getattr(settings, 'CLINICIAN_PATIENT_ACCESS_DAYS_AFTER_VISIT', getattr(settings, 'NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT', 7))
    cutoff = now - datetime.timedelta(days=days)

    from bookings.models import Booking, BookingStatus

    # Active / In-progress / Upcoming bookings or recent bookings within the access window
    return Booking.objects.filter(
        patient=patient,
        assigned_staff=staff
    ).exclude(
        status=BookingStatus.CANCELLED
    ).filter(
        Q(status__in=[BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS, BookingStatus.EN_ROUTE, BookingStatus.PENDING], scheduled_time__gte=cutoff) |
        Q(shift_end_time__isnull=False, shift_end_time__gte=cutoff) |
        Q(shift_end_time__isnull=True, scheduled_time__gte=cutoff)
    ).exists()


def is_care_manager_for_patient(user, patient):
    """
    Defines the 'care manager' for a patient:
    A user linked to an active StaffMember with role 'care_manager' who is explicitly
    assigned to the patient as patient.assigned_care_manager.
    A care manager not assigned to this patient is an unassigned care manager and does
    NOT have access to the patient's confidential clinical therapy records.
    """
    if not user or not user.is_authenticated:
        return False

    staff = getattr(user, 'staffmember', None)
    if not staff or staff.role != 'care_manager':
        return False

    return getattr(patient, 'assigned_care_manager_id', None) == staff.id


def can_view_psychotherapy_note(user, note):
    """
    Psychotherapy notes confidentiality rule:
    Psychotherapy notes are strictly confidential mental health records.
    Visible ONLY to:
      1. The author psychotherapist (note.author) or assigned psychotherapist for the patient.
      2. The patient's assigned treating doctor (is_treating_doctor_for_patient).
      3. The patient's assigned care manager (is_care_manager_for_patient).
      4. System administrators (super_admin, admin) for legal and clinical oversight.
    
    EXPLICITLY DENIED:
      - Nurses (RN, nursing assistants)
      - Physiotherapists
      - Speech therapists
      - Non-assigned care managers
      - Non-treating doctors
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    from homecareOS.permissions import get_user_role
    role = get_user_role(user)
    if role in ('super_admin', 'admin'):
        return True

    staff = getattr(user, 'staffmember', None)
    if not staff:
        return False

    # 1. Author check
    author = getattr(note, 'author', None) or getattr(note, 'physio', None) or getattr(note, 'doctor', None)
    if author and author.id == staff.id:
        return True

    # 2. Assigned psychotherapist check
    if staff.role in ('psychologist', 'psychotherapist'):
        assigned_ids = get_assigned_patient_ids_for_clinician(user)
        if assigned_ids is not None and note.patient_id in assigned_ids:
            return True

    # 3. Patient's assigned treating doctor check
    if staff.role == 'doctor' and is_treating_doctor_for_patient(user, note.patient):
        return True

    # 4. Patient's assigned care manager check
    if staff.role == 'care_manager' and is_care_manager_for_patient(user, note.patient):
        return True

    # All other roles (nurse, physio, speech, non-assigned care manager, non-treating doctor) are denied
    return False

