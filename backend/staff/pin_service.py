"""
Duty PIN & Patient File Lock Service
====================================
Centralized PIN generation, Fernet encryption/reveal, hash verification,
unlock session management, lockout handling, and enforcement helper.
"""
import base64
import datetime
import hashlib
import logging
import secrets
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from homecareOS.permissions import get_user_role
from notifications.models import Notification
from patients.scoping import get_assigned_patient_ids_for_clinician, staff_booking_q
from staff.models import DutyPIN, PatientFileAccessEvent, PatientFileUnlock

logger = logging.getLogger(__name__)
User = get_user_model()

# Field clinical roles that require a Duty PIN when PATIENT_FILE_PIN_REQUIRED=True.
# care_manager, admin, super_admin, patient_family, and non-field roles do NOT need a PIN.
FIELD_PIN_ROLES = ('nurse', 'doctor', 'physio', 'speech', 'psychologist', 'dietician')

_WARNED_FALLBACK_KEY = False


class PatientFileLocked(PermissionDenied):
    """403 Forbidden with machine-readable code 'patient_file_locked'."""
    def __init__(self, patient_id=None, detail='Patient file is locked. Enter your duty PIN to unlock.'):
        super().__init__(detail={
            'error': 'patient_file_locked',
            'code': 'patient_file_locked',
            'detail': detail,
            'patient_id': patient_id,
        })


def _get_fernet() -> Fernet:
    global _WARNED_FALLBACK_KEY
    raw_key = (getattr(settings, 'DUTY_PIN_ENCRYPTION_KEY', '') or '').strip()
    if raw_key:
        return Fernet(raw_key.encode('utf-8'))

    if not _WARNED_FALLBACK_KEY:
        logger.warning(
            "DUTY_PIN_ENCRYPTION_KEY is not set; deriving a fallback Fernet key from SECRET_KEY. "
            "Set DUTY_PIN_ENCRYPTION_KEY in the environment for production."
        )
        _WARNED_FALLBACK_KEY = True
    digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_pin(raw_pin: str) -> str:
    return _get_fernet().encrypt(raw_pin.encode('utf-8')).decode('utf-8')


def decrypt_pin(encrypted_pin: str) -> str:
    return _get_fernet().decrypt(encrypted_pin.encode('utf-8')).decode('utf-8')


def _get_local_tz():
    tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return timezone.get_current_timezone()


def _pin_valid_before_delta():
    return datetime.timedelta(minutes=int(getattr(settings, 'PIN_VALID_BEFORE_MINUTES', 30)))


def _grace_delta():
    return datetime.timedelta(minutes=int(getattr(settings, 'PATIENT_FILE_GRACE_MINUTES', 30)))


def _max_attempts():
    return int(getattr(settings, 'PIN_MAX_ATTEMPTS', 5))


def _lockout_delta():
    return datetime.timedelta(minutes=int(getattr(settings, 'PIN_LOCKOUT_MINUTES', 15)))


def _generate_unique_6_digit_pin(staff) -> str:
    """Generate a 6-digit PIN unique among currently active PINs for this staff member."""
    active_pins = DutyPIN.objects.filter(staff=staff, is_active=True, revoked_at__isnull=True)
    existing_hashes = list(active_pins.values_list('pin_hash', flat=True))
    for _ in range(50):
        candidate = f"{secrets.randbelow(1000000):06d}"
        if not any(check_password(candidate, h) for h in existing_hashes):
            return candidate
    return f"{secrets.randbelow(1000000):06d}"


def _log_event(event_type, *, actor=None, staff=None, patient=None, duty_pin=None, reason='', metadata=None):
    return PatientFileAccessEvent.objects.create(
        event_type=event_type,
        actor=actor,
        staff=staff,
        patient=patient,
        duty_pin=duty_pin,
        reason=reason,
        metadata=metadata or {},
    )


def _create_pin_record(staff, window_start, window_end, *, roster_assignment=None, booking=None, actor=None, event_type=PatientFileAccessEvent.EventType.PIN_GENERATED):
    raw_pin = _generate_unique_6_digit_pin(staff)
    pin_obj = DutyPIN.objects.create(
        staff=staff,
        roster_assignment=roster_assignment,
        booking=booking,
        window_start=window_start,
        window_end=window_end,
        pin_hash=make_password(raw_pin),
        pin_encrypted=encrypt_pin(raw_pin),
        generated_by=actor,
        is_active=True,
    )
    _log_event(
        event_type,
        actor=actor,
        staff=staff,
        duty_pin=pin_obj,
        metadata={'window_start': window_start.isoformat(), 'window_end': window_end.isoformat()},
    )
    return pin_obj, raw_pin


def ensure_pin_for_duty(staff, window_start, window_end, *, roster_assignment=None, booking=None, actor=None):
    """
    Create or reuse an active DutyPIN for (staff, window_start, window_end).
    Never returns the raw PIN in list payloads; returns (pin_obj, created_bool).
    """
    if not staff or getattr(staff, 'lifecycle_stage', None) == 'trainee' or not staff.is_active:
        return None, False

    if roster_assignment:
        existing = DutyPIN.objects.filter(
            staff=staff,
            roster_assignment=roster_assignment,
            is_active=True,
            revoked_at__isnull=True,
        ).first()
        if existing:
            return existing, False

    existing_win = DutyPIN.objects.filter(
        staff=staff,
        window_start=window_start,
        window_end=window_end,
        is_active=True,
        revoked_at__isnull=True,
    ).first()
    if existing_win:
        if roster_assignment and not existing_win.roster_assignment_id:
            existing_win.roster_assignment = roster_assignment
            existing_win.save(update_fields=['roster_assignment'])
        return existing_win, False

    pin_obj, _ = _create_pin_record(
        staff,
        window_start,
        window_end,
        roster_assignment=roster_assignment,
        booking=booking,
        actor=actor,
        event_type=PatientFileAccessEvent.EventType.PIN_GENERATED,
    )
    return pin_obj, True


def compute_booking_window(booking, staff):
    """Compute (window_start, window_end) for a Booking-only assignment."""
    start = booking.scheduled_time or timezone.now()
    if booking.shift_end_time and booking.shift_end_time > start:
        end = booking.shift_end_time
    else:
        default_hrs = 8 if staff.role == 'nurse' else (1 if staff.role == 'doctor' else 2)
        end = start + datetime.timedelta(hours=default_hrs)
    return start, end


def ensure_pin_for_booking(booking, actor=None):
    """Generate/reuse DutyPIN(s) for a Booking-only assignment (doctor, therapist, buddy-only)."""
    if not booking or booking.status in ('cancelled', 'completed'):
        return []
    pins = []
    for member in (booking.assigned_staff, booking.buddy_staff, booking.buddy):
        if not member or member.role not in FIELD_PIN_ROLES:
            continue
        w_start, w_end = compute_booking_window(booking, member)
        pin_obj, _ = ensure_pin_for_duty(
            member, w_start, w_end,
            roster_assignment=booking.roster_assignment,
            booking=booking,
            actor=actor,
        )
        if pin_obj:
            pins.append(pin_obj)
    return pins


def reveal_pin(duty_pin, actor):
    """Decrypt and return the 6-digit PIN for an admin/super_admin, logging the reveal."""
    raw_pin = decrypt_pin(duty_pin.pin_encrypted)
    _log_event(
        PatientFileAccessEvent.EventType.PIN_REVEALED,
        actor=actor,
        staff=duty_pin.staff,
        duty_pin=duty_pin,
    )
    return raw_pin


def end_sessions_for_pin(duty_pin, reason='revoked', actor=None, now=None):
    now = now or timezone.now()
    active_sessions = PatientFileUnlock.objects.filter(duty_pin=duty_pin, ended_at__isnull=True)
    for sess in active_sessions:
        sess.ended_at = now
        sess.ended_reason = reason
        sess.save(update_fields=['ended_at', 'ended_reason'])
        _log_event(
            PatientFileAccessEvent.EventType.SESSION_ENDED,
            actor=actor,
            staff=sess.staff,
            patient=sess.patient,
            duty_pin=duty_pin,
            reason=reason,
        )


def revoke_pin(duty_pin, actor=None, reason='revoked'):
    now = timezone.now()
    with transaction.atomic():
        if duty_pin.is_active or not duty_pin.revoked_at:
            duty_pin.is_active = False
            duty_pin.revoked_at = now
            duty_pin.revoked_by = actor
            duty_pin.save(update_fields=['is_active', 'revoked_at', 'revoked_by'])
            _log_event(
                PatientFileAccessEvent.EventType.PIN_REVOKED,
                actor=actor,
                staff=duty_pin.staff,
                duty_pin=duty_pin,
                reason=reason,
            )
        end_sessions_for_pin(duty_pin, reason=reason, actor=actor, now=now)
    return duty_pin


def regenerate_pin(duty_pin, actor):
    """Invalidate old PIN + end its active sessions, and issue a fresh 6-digit PIN for the same window."""
    now = timezone.now()
    with transaction.atomic():
        duty_pin.is_active = False
        duty_pin.revoked_at = now
        duty_pin.revoked_by = actor
        duty_pin.save(update_fields=['is_active', 'revoked_at', 'revoked_by'])
        end_sessions_for_pin(duty_pin, reason='regenerated', actor=actor, now=now)
        new_pin, raw_pin = _create_pin_record(
            duty_pin.staff,
            duty_pin.window_start,
            duty_pin.window_end,
            roster_assignment=duty_pin.roster_assignment,
            booking=duty_pin.booking,
            actor=actor,
            event_type=PatientFileAccessEvent.EventType.PIN_REGENERATED,
        )
    return new_pin, raw_pin


def end_patient_unlock_sessions(staff, patient, reason='visit_ended', actor=None):
    """End active unlock sessions for (staff, patient) immediately (e.g. Lock now or Visit End)."""
    now = timezone.now()
    sessions = PatientFileUnlock.objects.filter(staff=staff, patient=patient, ended_at__isnull=True)
    count = 0
    for sess in sessions:
        sess.ended_at = now
        sess.ended_reason = reason
        sess.save(update_fields=['ended_at', 'ended_reason'])
        _log_event(
            PatientFileAccessEvent.EventType.SESSION_ENDED,
            actor=actor,
            staff=staff,
            patient=patient,
            duty_pin=sess.duty_pin,
            reason=reason,
        )
        count += 1
    return count


def invalidate_pins_for_staff(staff, actor=None, reason='staff_deactivated'):
    """Revoke all active PINs and end all active sessions for a staff member."""
    active_pins = DutyPIN.objects.filter(staff=staff, is_active=True, revoked_at__isnull=True)
    for pin_obj in active_pins:
        revoke_pin(pin_obj, actor=actor, reason=reason)


def invalidate_patient_access_on_unassign(staff, patient, actor=None, reason='unassigned'):
    """End active unlock sessions for (staff, patient); if staff has no other active patients on that PIN, revoke it."""
    end_patient_unlock_sessions(staff, patient, reason=reason, actor=actor)


def get_pin_status_label(pin_obj, now=None):
    now = now or timezone.now()
    if pin_obj.revoked_at or not pin_obj.is_active:
        return 'revoked'
    if pin_obj.locked_until and pin_obj.locked_until > now:
        return 'locked_out'
    if now > pin_obj.window_end + _grace_delta():
        return 'expired'
    return 'active'


def _notify_admins_of_lockout(staff, duty_pin):
    admin_users = set(User.objects.filter(is_superuser=True, is_active=True))
    admin_users.update(User.objects.filter(profile__role__in=['super_admin', 'admin'], is_active=True))
    admin_users.update(User.objects.filter(staffmember__role='admin', is_active=True))
    msg = (
        f"Duty PIN locked out after {_max_attempts()} failed attempts: "
        f"{staff.full_name} (locked for {int(getattr(settings, 'PIN_LOCKOUT_MINUTES', 15))} mins)."
    )
    for u in admin_users:
        Notification.objects.create(
            recipient=u,
            icon_key='shield',
            message=msg,
            target_screen='staff',
            target_params={'staff_id': staff.id, 'duty_pin_id': duty_pin.id},
        )


def attempt_unlock_patient(user, patient, raw_pin: str, now=None):
    """
    Attempt to unlock `patient` for `user` using 6-digit `raw_pin`.
    Returns (success: bool, payload: dict, http_status: int).
    """
    now = now or timezone.now()
    staff = getattr(user, 'staffmember', None)
    if not staff or getattr(staff, 'lifecycle_stage', None) == 'trainee' or not staff.is_active:
        return False, {'error': 'forbidden', 'detail': 'Staff access denied.'}, 403

    # Verify clinician is actually assigned to this patient
    assigned_ids = get_assigned_patient_ids_for_clinician(user, now=now)
    if assigned_ids is not None and patient.id not in assigned_ids:
        return False, {'error': 'not_assigned', 'detail': 'You are not assigned to this patient.'}, 403

    raw_pin = (raw_pin or '').strip()

    # Candidate active PINs for this staff member (never reveal whether a PIN exists)
    pins = list(
        DutyPIN.objects.filter(
            staff=staff,
            is_active=True,
            revoked_at__isnull=True,
        ).order_by('-generated_at')
    )

    if not pins:
        _log_event(PatientFileAccessEvent.EventType.UNLOCK_FAILURE, actor=user, staff=staff, patient=patient, reason='invalid_pin')
        return False, {'error': 'invalid_pin', 'detail': 'Invalid PIN. Please verify with your admin or supervisor.'}, 400

    # Check if all candidate pins are currently locked out
    locked_pins = [p for p in pins if p.locked_until and p.locked_until > now]
    if locked_pins and len(locked_pins) == len(pins):
        mins_left = max(1, int((locked_pins[0].locked_until - now).total_seconds() // 60) + 1)
        return False, {
            'error': 'pin_locked_out',
            'detail': f'Too many wrong attempts. Try again in {mins_left} minute(s).',
            'locked_minutes': mins_left,
        }, 429

    # Check matching PIN using constant-time password verification
    matched_pin = None
    for p in pins:
        if p.locked_until and p.locked_until > now:
            continue
        if check_password(raw_pin, p.pin_hash):
            matched_pin = p
            break

    if matched_pin:
        valid_from = matched_pin.window_start - _pin_valid_before_delta()
        valid_until = matched_pin.window_end + _grace_delta()

        if now < valid_from:
            return False, {
                'error': 'pin_not_valid_yet',
                'detail': 'PIN is not valid yet. Access opens 30 minutes before your shift.',
            }, 400
        if now > valid_until:
            return False, {
                'error': 'pin_expired',
                'detail': 'PIN has expired. Ask your admin to schedule a new duty or issue a new PIN.',
            }, 400

        # Reset failed attempts and create unlock session
        if matched_pin.failed_attempts > 0 or matched_pin.locked_until:
            matched_pin.failed_attempts = 0
            matched_pin.locked_until = None
            matched_pin.save(update_fields=['failed_attempts', 'locked_until'])

        # End any stale active session for (staff, patient) before opening new one
        PatientFileUnlock.objects.filter(staff=staff, patient=patient, ended_at__isnull=True).update(
            ended_at=now, ended_reason='re_unlocked'
        )
        sess = PatientFileUnlock.objects.create(
            staff=staff,
            patient=patient,
            duty_pin=matched_pin,
            expires_at=valid_until,
        )
        _log_event(
            PatientFileAccessEvent.EventType.UNLOCK_SUCCESS,
            actor=user,
            staff=staff,
            patient=patient,
            duty_pin=matched_pin,
            metadata={'expires_at': valid_until.isoformat()},
        )
        return True, {
            'unlocked': True,
            'patient_id': patient.id,
            'expires_at': sess.expires_at.isoformat(),
        }, 200

    # Wrong PIN: increment failed_attempts on the most relevant active PIN
    target_pin = next((p for p in pins if not (p.locked_until and p.locked_until > now)), pins[0])
    target_pin.failed_attempts += 1
    max_att = _max_attempts()
    if target_pin.failed_attempts >= max_att:
        target_pin.locked_until = now + _lockout_delta()
        target_pin.save(update_fields=['failed_attempts', 'locked_until'])
        _log_event(
            PatientFileAccessEvent.EventType.LOCKOUT,
            actor=user,
            staff=staff,
            patient=patient,
            duty_pin=target_pin,
            reason=f'{max_att} failed attempts',
        )
        _notify_admins_of_lockout(staff, target_pin)
        mins = int(getattr(settings, 'PIN_LOCKOUT_MINUTES', 15))
        return False, {
            'error': 'pin_locked_out',
            'detail': f'Too many wrong attempts. Locked for {mins} minutes.',
            'locked_minutes': mins,
        }, 429

    target_pin.save(update_fields=['failed_attempts'])
    attempts_left = max_att - target_pin.failed_attempts
    _log_event(
        PatientFileAccessEvent.EventType.UNLOCK_FAILURE,
        actor=user,
        staff=staff,
        patient=patient,
        duty_pin=target_pin,
        reason='wrong_pin',
        metadata={'attempts_left': attempts_left},
    )
    return False, {
        'error': 'invalid_pin',
        'detail': f'Invalid PIN. {attempts_left} attempt(s) remaining.',
        'attempts_left': attempts_left,
    }, 400


def is_patient_unlocked_for_user(user, patient_id, now=None) -> tuple[bool, PatientFileUnlock | None]:
    """
    Returns (is_unlocked, active_session_or_None).
    Always True when PATIENT_FILE_PIN_REQUIRED is False or user role is exempt.
    """
    if not getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False):
        return True, None

    if not user or not user.is_authenticated:
        return False, None

    if user.is_superuser:
        return True, None

    role = get_user_role(user)
    if role in ('super_admin', 'admin', 'care_manager', 'patient_family', 'family') or role not in FIELD_PIN_ROLES:
        return True, None

    staff = getattr(user, 'staffmember', None)
    if not staff or getattr(staff, 'lifecycle_stage', None) == 'trainee':
        return True, None

    now = now or timezone.now()
    sess = (
        PatientFileUnlock.objects
        .filter(
            staff=staff,
            patient_id=patient_id,
            ended_at__isnull=True,
            expires_at__gt=now,
            duty_pin__is_active=True,
            duty_pin__revoked_at__isnull=True,
        )
        .order_by('-unlocked_at')
        .first()
    )
    return (sess is not None), sess


def require_patient_file_unlock(user, patient_id_or_obj, now=None):
    """
    Central lock enforcement check.
    Called alongside assignment scoping and enforce_clinical_write_permission.
    Raises PatientFileLocked (HTTP 403, code='patient_file_locked') when locked.
    """
    if not getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False):
        return True

    if patient_id_or_obj is None:
        return True

    if hasattr(patient_id_or_obj, 'id'):
        pid = patient_id_or_obj.id
    elif hasattr(patient_id_or_obj, 'pk'):
        pid = patient_id_or_obj.pk
    else:
        try:
            pid = int(patient_id_or_obj)
        except (ValueError, TypeError):
            return True

    unlocked, _ = is_patient_unlocked_for_user(user, pid, now=now)
    if not unlocked:
        raise PatientFileLocked(patient_id=pid)
    return True

