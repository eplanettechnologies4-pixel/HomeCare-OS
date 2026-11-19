import datetime
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from accounts.models import AuditLog
from patients.scoping import is_treating_doctor_for_patient, is_care_manager_for_patient


def get_record_author_user_id(instance):
    """
    Returns the User ID of the clinician who authored/recorded this entry.
    Inspects common author fields: recorded_by, created_by, entered_by,
    uploaded_by, administered_by, doctor, physio, author.
    """
    # 1. StaffMember FK fields
    for field in ('recorded_by', 'administered_by', 'doctor', 'physio', 'author'):
        staff = getattr(instance, field, None)
        if staff and hasattr(staff, 'user_id'):
            return staff.user_id

    # 2. User FK fields
    for field in ('created_by', 'entered_by', 'uploaded_by', 'done_by', 'author'):
        usr = getattr(instance, field, None)
        if usr and hasattr(usr, 'id'):
            return usr.id

    return None


def can_mark_entered_in_error(user, patient, instance):
    """
    Evaluates whether the user may mark the clinical record as entered in error:
      - The author who recorded it — only within settings.CLINICAL_RECORD_EDIT_WINDOW_MINUTES.
      - The patient's assigned treating doctor — at any time.
      - Admin, super_admin, care_manager, and all other roles — 403 Forbidden.
    Returns: (is_allowed: bool, rejection_detail: str)
    """
    if not user or not user.is_authenticated:
        return False, "Authentication required."

    # Explicit rule: Admin, super_admin, care_manager, other staff: 403 Forbidden
    # Even superusers are not treating clinicians unless assigned
    author_user_id = get_record_author_user_id(instance)
    is_author = (author_user_id is not None and author_user_id == user.id)

    # 1. Treating doctor check (at any time)
    is_assigned_doc = is_treating_doctor_for_patient(user, patient)
    if is_assigned_doc:
        return True, ""

    # 2. Author check (within edit window only)
    if is_author:
        if hasattr(instance, 'is_within_edit_window') and not instance.is_within_edit_window():
            window = getattr(settings, 'CLINICAL_RECORD_EDIT_WINDOW_MINUTES', 15)
            return False, f"Author edit window of {window} minutes has expired. Contact the assigned treating doctor."
        return True, ""

    # 3. All others blocked
    return False, "Only the recording author (within the edit window) or the patient's assigned treating doctor may mark records as entered in error."


def handle_mark_entered_in_error(request, patient, instance, record_type):
    """
    Shared handler for mark-entered-in-error endpoints.
    Validates permissions, mandatory reason, irreversibility, logs audit, and updates record.
    """
    if instance.is_entered_in_error:
        return Response(
            {'error': 'This record has already been marked as entered in error.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    reason = (request.data.get('reason') or '').strip()
    if not reason:
        return Response(
            {'reason': 'A reason is required to mark a record as entered in error.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    can_mark, detail_msg = can_mark_entered_in_error(request.user, patient, instance)
    if not can_mark:
        AuditLog.objects.create(
            actor=request.user,
            actor_name=request.user.get_full_name() or request.user.username,
            action='Mark Entered in Error Blocked',
            target_user=f"Patient {patient.patient_code or patient.id}",
            details=f"Blocked attempt to mark {record_type} #{instance.id} entered in error: {detail_msg}",
            timestamp=timezone.now()
        )
        return Response({'detail': detail_msg}, status=status.HTTP_403_FORBIDDEN)

    instance.mark_as_entered_in_error(request.user, reason)

    # Write audit log WITHOUT clinical values or note text
    AuditLog.objects.create(
        actor=request.user,
        actor_name=request.user.get_full_name() or request.user.username,
        action='Mark Record Entered in Error',
        target_user=f"Patient {patient.patient_code or patient.id}",
        details=f"Marked {record_type} #{instance.id} entered in error. Reason: {reason}",
        timestamp=timezone.now()
    )

    return Response({
        'success': True,
        'message': f'{record_type} marked as entered in error.',
        'record_id': instance.id,
        'is_entered_in_error': True,
        'entered_in_error_at': instance.entered_in_error_at.isoformat() if instance.entered_in_error_at else None,
        'entered_in_error_by': request.user.get_full_name() or request.user.username,
        'entered_in_error_reason': reason,
    }, status=status.HTTP_200_OK)


def validate_clinical_record_edit(request, patient, instance, record_type):
    """
    Validates whether a clinical record may be modified via PUT/PATCH:
      1. If record is already marked as entered in error -> 400 Bad Request.
      2. If caller is not the author -> 403 Forbidden.
      3. If caller is author but outside edit window -> 400 Bad Request.
    Returns: None if valid, or Response with appropriate error status and audit log.
    """
    if instance.is_entered_in_error:
        return Response(
            {'error': 'Records marked as entered in error are immutable and cannot be edited.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    author_user_id = get_record_author_user_id(instance)
    if author_user_id is None or author_user_id != request.user.id:
        AuditLog.objects.create(
            actor=request.user,
            actor_name=request.user.get_full_name() or request.user.username,
            action='Clinical Edit Blocked',
            target_user=f"Patient {patient.patient_code or patient.id}",
            details=f"Blocked non-author edit attempt on {record_type} #{instance.id}",
            timestamp=timezone.now()
        )
        return Response(
            {'detail': 'Only the clinician who recorded this entry may edit it.'},
            status=status.HTTP_403_FORBIDDEN
        )

    if hasattr(instance, 'is_within_edit_window') and not instance.is_within_edit_window():
        window = getattr(settings, 'CLINICAL_RECORD_EDIT_WINDOW_MINUTES', 15)
        AuditLog.objects.create(
            actor=request.user,
            actor_name=request.user.get_full_name() or request.user.username,
            action='Clinical Edit Blocked',
            target_user=f"Patient {patient.patient_code or patient.id}",
            details=f"Blocked expired edit attempt on {record_type} #{instance.id} (window: {window}m)",
            timestamp=timezone.now()
        )
        return Response(
            {'detail': f'Edit window of {window} minutes has expired. Use entered-in-error and add a corrected entry.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    return None


def handle_clinical_record_destroy_blocked(request, patient, instance, record_type):
    """
    Shared 405 Method Not Allowed response for any clinical record DELETE call.
    Logs audit entry without clinical values.
    """
    AuditLog.objects.create(
        actor=request.user,
        actor_name=request.user.get_full_name() or request.user.username,
        action='Clinical Delete Blocked',
        target_user=f"Patient {patient.patient_code or patient.id}",
        details=f"Blocked physical deletion on {record_type} #{instance.id}",
        timestamp=timezone.now()
    )
    return Response(
        {'detail': 'Physical deletion of clinical records is prohibited. Use mark-entered-in-error.'},
        status=status.HTTP_405_METHOD_NOT_ALLOWED
    )


def evaluate_vitals_alert_tier(vital):
    """
    Evaluates the alert tier (critical, less_critical, mild, or None) for a VitalSign entry.
    Excludes entries marked as entered in error (returns None).
    """
    if not vital or getattr(vital, 'is_entered_in_error', False):
        return None

    tier_thresholds = getattr(settings, 'VITALS_ALERT_TIERS', {})
    crit_th = tier_thresholds.get('critical', {})
    less_th = tier_thresholds.get('less_critical', {})
    mild_th = tier_thresholds.get('mild', {})

    sys = vital.blood_pressure_systolic
    dia = vital.blood_pressure_diastolic
    hr = vital.heart_rate
    spo2 = vital.spo2
    temp = float(vital.temperature) if vital.temperature else None
    bg = float(vital.blood_glucose) if vital.blood_glucose else None

    # 1. Critical
    if (
        (sys and sys >= crit_th.get('systolic_high', 180)) or
        (sys and sys <= crit_th.get('systolic_low', 80)) or
        (dia and dia >= crit_th.get('diastolic_high', 110)) or
        (dia and dia <= crit_th.get('diastolic_low', 50)) or
        (spo2 and spo2 <= crit_th.get('spo2_low', 88)) or
        (hr and hr >= crit_th.get('heart_rate_high', 130)) or
        (hr and hr <= crit_th.get('heart_rate_low', 40)) or
        (temp and temp >= crit_th.get('temperature_high', 39.5)) or
        (temp and temp <= crit_th.get('temperature_low', 35.0))
    ):
        return 'critical'

    # 2. Less Critical
    if (
        (sys and less_th.get('systolic_high_min', 160) <= sys <= less_th.get('systolic_high_max', 179)) or
        (sys and less_th.get('systolic_low_min', 81) <= sys <= less_th.get('systolic_low_max', 89)) or
        (spo2 and less_th.get('spo2_low_min', 89) <= spo2 <= less_th.get('spo2_low_max', 91)) or
        (hr and less_th.get('heart_rate_high_min', 110) <= hr <= less_th.get('heart_rate_high_max', 129)) or
        (hr and less_th.get('heart_rate_low_min', 40) <= hr <= less_th.get('heart_rate_low_max', 49)) or
        (temp and less_th.get('temperature_high_min', 38.5) <= temp <= less_th.get('temperature_high_max', 39.0))
    ):
        return 'less_critical'

    # 3. Mild
    if (
        (sys and mild_th.get('systolic_min', 135) <= sys <= mild_th.get('systolic_max', 140)) or
        (temp and mild_th.get('temperature_min', 38.1) <= temp <= mild_th.get('temperature_max', 38.4))
    ):
        return 'mild'

    return None

