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
