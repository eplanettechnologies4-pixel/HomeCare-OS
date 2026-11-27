import datetime
import re
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking, BookingStatus, ServiceType, ShiftDuration
from notifications.models import Notification
from patients.models import Patient
from staff.duty_service import schedule_staff_duty
from staff.models import (
    DutyPIN,
    PatientFileAccessEvent,
    PatientFileUnlock,
    RosterAssignment,
    RosterWeek,
    StaffMember,
    StaffRole,
)
from staff.pin_service import (
    attempt_unlock_patient,
    decrypt_pin,
    ensure_pin_for_booking,
    ensure_pin_for_duty,
    get_pin_status_label,
    is_patient_unlocked_for_user,
    regenerate_pin,
)

User = get_user_model()


def _make_staff(username, role, lifecycle_stage='active', is_superuser=False, is_staff=False):
    user = User.objects.create_user(
        username=username,
        password='password123',
        first_name=username.title(),
        last_name='User',
        is_staff=is_staff or is_superuser or role in ('admin', 'super_admin'),
        is_superuser=is_superuser,
    )
    staff = StaffMember.objects.create(
        user=user,
        first_name=user.first_name,
        last_name=user.last_name,
        role=role,
        employee_id=f"EMP-{username.upper()[:10]}-{user.id}",
        hire_date=datetime.date(2023, 1, 1),
        lifecycle_stage=lifecycle_stage,
        is_active=True,
    )
    return user, staff


def _make_family_user(username):
    return User.objects.create_user(
        username=username,
        password='password123',
        first_name=username.title(),
        last_name='Family',
    )


def _make_patient(suffix='1', care_manager=None, portal_user=None):
    return Patient.objects.create(
        first_name='PIN',
        last_name=f'Patient {suffix}',
        mr_number=f'PIN-MR-{suffix}',
        patient_code=f'PIN-PT-{suffix}',
        date_of_birth=datetime.date(1985, 1, 1),
        gender=Patient.Gender.MALE,
        address='123 Test Street',
        phone='+92-300-0000001',
        emergency_contact_name='Guardian',
        emergency_contact_phone='+92-300-0000002',
        emergency_contact_relation='Sibling',
        primary_diagnosis='Post-op care',
        assigned_care_manager=care_manager,
        portal_user=portal_user,
        is_active=True,
    )


@pytest.mark.django_db
def test_pin_generation_hash_encrypt_and_never_in_list_payloads():
    admin_user, _ = _make_staff('pin_admin_1', StaffRole.ADMIN, is_staff=True)
    nurse_user, nurse = _make_staff('pin_nurse_1', StaffRole.NURSE)
    patient = _make_patient('1')
    today = timezone.localdate()

    res = schedule_staff_duty(
        actor=admin_user,
        staff=nurse,
        patients=[patient],
        date=today,
        start_time='08:00',
        end_time='16:00',
        is_published=True,
    )
    pin_obj = res['duty_pin']
    assert pin_obj is not None
    raw_pin = decrypt_pin(pin_obj.pin_encrypted)
    assert re.match(r'^\d{6}$', raw_pin)
    assert check_password(raw_pin, pin_obj.pin_hash)
    assert pin_obj.pin_encrypted != raw_pin

    # Reveal works for admin & logs event
    client = APIClient()
    client.force_authenticate(user=admin_user)
    rev_res = client.get(f'/api/staff/duty-pins/{pin_obj.id}/reveal/')
    assert rev_res.status_code == 200
    assert rev_res.json()['pin'] == raw_pin
    assert PatientFileAccessEvent.objects.filter(
        duty_pin=pin_obj, event_type=PatientFileAccessEvent.EventType.PIN_REVEALED
    ).exists()

    # List endpoints must NEVER expose raw PIN
    list_res = client.get(f'/api/staff/duty-pins/?staff_id={nurse.id}')
    assert list_res.status_code == 200
    assert raw_pin not in list_res.content.decode('utf-8')

    client.force_authenticate(user=nurse_user)
    for url in ['/api/staff-portal/home/', '/api/staff-portal/roster/', '/api/staff-portal/patients/']:
        r = client.get(url)
        assert r.status_code == 200
        assert raw_pin not in r.content.decode('utf-8')

    # Nurse cannot reveal PIN
    assert client.get(f'/api/staff/duty-pins/{pin_obj.id}/reveal/').status_code == 403


@pytest.mark.django_db
@override_settings(PATIENT_FILE_PIN_REQUIRED=True)
def test_pin_window_validity_grace_and_overnight():
    _, nurse = _make_staff('pin_nurse_win', StaffRole.NURSE)
    patient = _make_patient('win')

    base_start = timezone.now().replace(minute=0, second=0, microsecond=0)
    w_start = base_start
    w_end = base_start + datetime.timedelta(hours=12)
    Booking.objects.create(
        patient=patient,
        assigned_staff=nurse,
        service_type=ServiceType.NURSING,
        status=BookingStatus.ASSIGNED,
        scheduled_time=w_start,
        shift_end_time=w_end,
        shift_duration=ShiftDuration.TWELVE_HOURS,
        address='Addr',
        amount=Decimal('0.00'),
    )
    pin_obj, _ = ensure_pin_for_duty(nurse, w_start, w_end)
    raw_pin = decrypt_pin(pin_obj.pin_encrypted)

    # 40 min before start -> invalid (not valid yet)
    ok, payload, code = attempt_unlock_patient(nurse.user, patient, raw_pin, now=w_start - datetime.timedelta(minutes=40))
    assert not ok and code == 400 and payload['error'] == 'pin_not_valid_yet'

    # 20 min before start (within 30m PIN_VALID_BEFORE_MINUTES) -> valid
    ok, payload, code = attempt_unlock_patient(nurse.user, patient, raw_pin, now=w_start - datetime.timedelta(minutes=20))
    assert ok and code == 200

    # End session, then test grace period (20m after w_end, within 30m PATIENT_FILE_GRACE_MINUTES) -> valid
    PatientFileUnlock.objects.filter(staff=nurse, patient=patient).update(ended_at=timezone.now(), ended_reason='test')
    ok, payload, code = attempt_unlock_patient(nurse.user, patient, raw_pin, now=w_end + datetime.timedelta(minutes=20))
    assert ok and code == 200

    # 35 min after w_end (past grace) -> expired
    PatientFileUnlock.objects.filter(staff=nurse, patient=patient).update(ended_at=timezone.now(), ended_reason='test')
    ok, payload, code = attempt_unlock_patient(nurse.user, patient, raw_pin, now=w_end + datetime.timedelta(minutes=35))
    assert not ok and code == 400 and payload['error'] == 'pin_expired'
    assert get_pin_status_label(pin_obj, now=w_end + datetime.timedelta(minutes=35)) == 'expired'


@pytest.mark.django_db
@override_settings(PATIENT_FILE_PIN_REQUIRED=True, PIN_MAX_ATTEMPTS=5, PIN_LOCKOUT_MINUTES=15)
def test_five_wrong_attempts_triggers_lockout_and_admin_notification():
    admin_user, _ = _make_staff('pin_admin_lock', StaffRole.ADMIN, is_staff=True)
    nurse_user, nurse = _make_staff('pin_nurse_lock', StaffRole.NURSE)
    patient = _make_patient('lock')

    now = timezone.now()
    Booking.objects.create(
        patient=patient,
        assigned_staff=nurse,
        service_type=ServiceType.NURSING,
        status=BookingStatus.ASSIGNED,
        scheduled_time=now,
        shift_duration=ShiftDuration.EIGHT_HOURS,
        address='Addr',
        amount=Decimal('0.00'),
    )
    pin_obj, _ = ensure_pin_for_duty(nurse, now - datetime.timedelta(hours=1), now + datetime.timedelta(hours=7))
    raw_pin = decrypt_pin(pin_obj.pin_encrypted)
    wrong_pin = '000000' if raw_pin != '000000' else '999999'

    client = APIClient()
    client.force_authenticate(user=nurse_user)

    for idx in range(4):
        r = client.post(f'/api/patients/{patient.id}/unlock/', {'pin': wrong_pin}, format='json')
        assert r.status_code == 400
        assert r.json()['error'] == 'invalid_pin'

    # 5th attempt triggers lockout
    r5 = client.post(f'/api/patients/{patient.id}/unlock/', {'pin': wrong_pin}, format='json')
    assert r5.status_code in (400, 429)
    pin_obj.refresh_from_db()
    assert get_pin_status_label(pin_obj) == 'locked_out'
    assert Notification.objects.filter(recipient=admin_user, message__icontains='PIN locked out').exists()
    assert PatientFileAccessEvent.objects.filter(
        staff=nurse, patient=patient, event_type=PatientFileAccessEvent.EventType.LOCKOUT
    ).exists()

    # Even the correct PIN is rejected during lockout
    r6 = client.post(f'/api/patients/{patient.id}/unlock/', {'pin': raw_pin}, format='json')
    assert r6.status_code == 429
    assert r6.json()['error'] == 'pin_locked_out'


@pytest.mark.django_db
@override_settings(PATIENT_FILE_PIN_REQUIRED=True)
def test_invalidation_triggers_regenerate_revoke_unassign_cancel_visit_end_deactivate_trainee():
    admin_user, _ = _make_staff('pin_admin_inv', StaffRole.ADMIN, is_staff=True)
    nurse_user, nurse = _make_staff('pin_nurse_inv', StaffRole.NURSE)
    patient = _make_patient('inv')
    now = timezone.now()

    bk = Booking.objects.create(
        patient=patient,
        assigned_staff=nurse,
        service_type=ServiceType.NURSING,
        status=BookingStatus.IN_PROGRESS,
        scheduled_time=now - datetime.timedelta(hours=1),
        shift_duration=ShiftDuration.EIGHT_HOURS,
        address='Addr',
        amount=Decimal('0.00'),
    )
    pin_obj = ensure_pin_for_booking(bk)[0]
    raw1 = decrypt_pin(pin_obj.pin_encrypted)

    ok, _, _ = attempt_unlock_patient(nurse_user, patient, raw1, now=now)
    assert ok
    assert is_patient_unlocked_for_user(nurse_user, patient.id, now=now)[0]

    # 1. Regenerate ends unlock session and revokes old PIN
    new_pin_obj, raw2 = regenerate_pin(pin_obj, admin_user)
    assert raw2 != raw1
    assert not is_patient_unlocked_for_user(nurse_user, patient.id, now=now)[0]

    # Re-unlock with new PIN
    ok, _, _ = attempt_unlock_patient(nurse_user, patient, raw2, now=now)
    assert ok

    # 2. Visit end ends unlock session
    client = APIClient()
    client.force_authenticate(user=nurse_user)
    end_res = client.post('/api/staff-portal/visit/end/', {'booking_id': bk.id}, format='json')
    assert end_res.status_code in (200, 400)
    if end_res.status_code == 200:
        assert not is_patient_unlocked_for_user(nurse_user, patient.id, now=now)[0]

    # Re-unlock and test unassign_patient
    attempt_unlock_patient(nurse_user, patient, raw2, now=now)
    client.force_authenticate(user=admin_user)
    un_res = client.post(
        f'/api/staff/members/{nurse.id}/unassign-patient/',
        {'patient_id': patient.id, 'booking_id': bk.id},
        format='json',
    )
    assert un_res.status_code == 200
    assert not is_patient_unlocked_for_user(nurse_user, patient.id, now=now)[0]
    new_pin_obj.refresh_from_db()
    assert not new_pin_obj.is_active and new_pin_obj.revoked_at is not None

    # 3. Booking cancel revokes PIN
    bk2 = Booking.objects.create(
        patient=patient,
        assigned_staff=nurse,
        service_type=ServiceType.NURSING,
        status=BookingStatus.ASSIGNED,
        scheduled_time=now,
        shift_duration=ShiftDuration.EIGHT_HOURS,
        address='Addr',
        amount=Decimal('0.00'),
    )
    pin2 = ensure_pin_for_booking(bk2)[0]
    cancel_res = client.post(f'/api/bookings/{bk2.id}/cancel/', {}, format='json')
    assert cancel_res.status_code == 200
    pin2.refresh_from_db()
    assert not pin2.is_active and pin2.revoked_at is not None

    # 4. Deactivate invalidates active PINs
    pin3, _ = ensure_pin_for_duty(nurse, now, now + datetime.timedelta(hours=8))
    deact_res = client.post(f'/api/staff/members/{nurse.id}/deactivate/', {'reason': 'Leave'}, format='json')
    assert deact_res.status_code == 200
    pin3.refresh_from_db()
    assert not pin3.is_active and pin3.revoked_at is not None

    # 5. Return to trainee invalidates active PINs
    nurse.is_active = True
    nurse.lifecycle_stage = 'probation'
    nurse.save(update_fields=['is_active', 'lifecycle_stage'])
    pin4, _ = ensure_pin_for_duty(nurse, now, now + datetime.timedelta(hours=8))
    ret_res = client.post(f'/api/staff/{nurse.id}/stage/return/', {'reason': 'Review'}, format='json')
    assert ret_res.status_code == 200
    pin4.refresh_from_db()
    assert not pin4.is_active and pin4.revoked_at is not None


@pytest.mark.django_db
def test_enforcement_off_vs_on_and_role_matrix():
    admin_user, _ = _make_staff('pin_admin_m', StaffRole.ADMIN, is_staff=True)
    super_user, _ = _make_staff('pin_super_m', StaffRole.ADMIN, is_superuser=True, is_staff=True)
    cm_user, cm = _make_staff('pin_cm_m', StaffRole.CARE_MANAGER)
    family_user = _make_family_user('pin_family_m')
    nurse_user, nurse = _make_staff('pin_nurse_m', StaffRole.NURSE)
    doc_user, doc = _make_staff('pin_doc_m', StaffRole.DOCTOR)
    trainee_user, trainee = _make_staff('pin_trainee_m', StaffRole.NURSE, lifecycle_stage='trainee')

    patient = _make_patient('mat', care_manager=cm, portal_user=family_user)
    now = timezone.now()
    for st, svc in [(nurse, ServiceType.NURSING), (doc, ServiceType.DOCTOR_CONSULTATION)]:
        Booking.objects.create(
            patient=patient,
            assigned_staff=st,
            service_type=svc,
            status=BookingStatus.ASSIGNED,
            scheduled_time=now,
            shift_duration=ShiftDuration.EIGHT_HOURS,
            address='Addr',
            amount=Decimal('0.00'),
        )
    pin_nurse, _ = ensure_pin_for_duty(nurse, now - datetime.timedelta(hours=1), now + datetime.timedelta(hours=7))

    client = APIClient()

    # Flag OFF -> nurse can open directly
    with override_settings(PATIENT_FILE_PIN_REQUIRED=False):
        client.force_authenticate(user=nurse_user)
        assert client.get(f'/api/patients/{patient.id}/patient-file/').status_code == 200

    # Flag ON -> admin, super_admin, care_manager, family unaffected; nurse & doctor locked; trainee blocked
    with override_settings(PATIENT_FILE_PIN_REQUIRED=True):
        for u in (admin_user, super_user, cm_user, family_user):
            client.force_authenticate(user=u)
            assert client.get(f'/api/patients/{patient.id}/patient-file/').status_code == 200

        for u in (nurse_user, doc_user):
            client.force_authenticate(user=u)
            r = client.get(f'/api/patients/{patient.id}/patient-file/')
            assert r.status_code == 403
            assert r.json()['code'] == 'patient_file_locked'

        client.force_authenticate(user=trainee_user)
        assert client.get(f'/api/patients/{patient.id}/patient-file/').status_code in (403, 404)

        # Unlock nurse -> now 200
        client.force_authenticate(user=nurse_user)
        assert client.post(f'/api/patients/{patient.id}/unlock/', {'pin': decrypt_pin(pin_nurse.pin_encrypted)}, format='json').status_code == 200
        assert client.get(f'/api/patients/{patient.id}/patient-file/').status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize(
    'url_tpl',
    [
        '/api/patients/{pid}/patient-file/',
        '/api/patients/{pid}/mar-sheet/',
        '/api/patients/{pid}/vitals/',
        '/api/patients/{pid}/notes/',
        '/api/patients/{pid}/labs/',
        '/api/patients/{pid}/prescriptions/',
    ],
)
@override_settings(PATIENT_FILE_PIN_REQUIRED=True)
def test_clinical_endpoints_locked_before_unlock(url_tpl):
    nurse_user, nurse = _make_staff('pin_nurse_ep', StaffRole.NURSE)
    patient = _make_patient('ep')
    now = timezone.now()
    Booking.objects.create(
        patient=patient,
        assigned_staff=nurse,
        service_type=ServiceType.NURSING,
        status=BookingStatus.ASSIGNED,
        scheduled_time=now,
        shift_duration=ShiftDuration.EIGHT_HOURS,
        address='Addr',
        amount=Decimal('0.00'),
    )
    client = APIClient()
    client.force_authenticate(user=nurse_user)
    res = client.get(url_tpl.format(pid=patient.id))
    assert res.status_code == 403
    assert res.json()['code'] == 'patient_file_locked'


@pytest.mark.django_db
def test_generate_duty_pins_command_dry_run_and_confirm():
    admin_user, _ = _make_staff('pin_cmd_admin', StaffRole.ADMIN, is_staff=True)
    _, nurse = _make_staff('pin_cmd_nurse', StaffRole.NURSE)
    today = timezone.localdate()
    past_date = today - datetime.timedelta(days=3)
    future_date = today + datetime.timedelta(days=2)

    past_week = RosterWeek.objects.create(
        week_start_date=past_date - datetime.timedelta(days=past_date.weekday()),
    )
    future_week, _ = RosterWeek.objects.get_or_create(
        week_start_date=future_date - datetime.timedelta(days=future_date.weekday()),
    )

    RosterAssignment.objects.create(roster_week=past_week, staff=nurse, date=past_date, shift_name='Morning Shift')
    future_ra = RosterAssignment.objects.create(roster_week=future_week, staff=nurse, date=future_date, shift_name='Morning Shift')

    call_command('generate_duty_pins')
    assert DutyPIN.objects.count() == 0

    call_command('generate_duty_pins', '--confirm')
    assert DutyPIN.objects.filter(roster_assignment=future_ra).count() == 1
    assert DutyPIN.objects.filter(roster_assignment__date=past_date).count() == 0
