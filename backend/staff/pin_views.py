import datetime
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from homecareOS.permissions import get_user_role
from patients.models import Patient
from .models import DutyPIN, PatientFileAccessEvent, StaffMember
from .pin_service import (
    attempt_unlock_patient,
    end_patient_unlock_sessions,
    get_pin_status_label,
    is_patient_unlocked_for_user,
    regenerate_pin,
    reveal_pin,
    revoke_pin,
)


def _is_pin_admin(user):
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return get_user_role(user) in ('admin', 'super_admin')


def _serialize_access_event(ev):
    actor_name = ''
    if ev.actor:
        actor_name = ev.actor.get_full_name() or ev.actor.username
    return {
        'id': ev.id,
        'event_type': ev.event_type,
        'event_type_display': ev.get_event_type_display(),
        'staff_id': ev.staff_id,
        'staff_name': ev.staff.full_name if ev.staff else '',
        'actor_id': ev.actor_id,
        'actor_name': actor_name,
        'patient_id': ev.patient_id,
        'patient_name': ev.patient.full_name if ev.patient else '',
        'duty_pin_id': ev.duty_pin_id,
        'detail': ev.reason,
        'created_at': ev.created_at.isoformat(),
    }


def _serialize_duty_pin_summary(pin_obj):
    before_delta = datetime.timedelta(minutes=int(getattr(settings, 'PIN_VALID_BEFORE_MINUTES', 30)))
    grace_delta = datetime.timedelta(minutes=int(getattr(settings, 'PATIENT_FILE_GRACE_MINUTES', 30)))
    return {
        'id': pin_obj.id,
        'staff_id': pin_obj.staff_id,
        'staff_name': pin_obj.staff.full_name if pin_obj.staff else '',
        'roster_assignment_id': pin_obj.roster_assignment_id,
        'booking_id': pin_obj.booking_id,
        'window_start': pin_obj.window_start.isoformat(),
        'window_end': pin_obj.window_end.isoformat(),
        'valid_from': (pin_obj.window_start - before_delta).isoformat(),
        'valid_until': (pin_obj.window_end + grace_delta).isoformat(),
        'status': get_pin_status_label(pin_obj),
        'failed_attempts': pin_obj.failed_attempts,
        'locked_until': pin_obj.locked_until.isoformat() if pin_obj.locked_until else None,
        'is_revoked': (not pin_obj.is_active) or (pin_obj.revoked_at is not None),
        'revoked_at': pin_obj.revoked_at.isoformat() if pin_obj.revoked_at else None,
        'created_at': pin_obj.generated_at.isoformat(),
    }


class PatientUnlockView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        patient = get_object_or_404(Patient, pk=pk)
        raw_pin = request.data.get('pin', '')
        ok, payload, status_code = attempt_unlock_patient(request.user, patient, raw_pin)
        return Response(payload, status=status_code)


class PatientLockView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        patient = get_object_or_404(Patient, pk=pk)
        staff = StaffMember.objects.filter(user=request.user).first()
        ended = 0
        if staff:
            ended = end_patient_unlock_sessions(staff, patient, reason='manual_lock', actor=request.user)
        return Response({'locked': True, 'patient_id': patient.id, 'sessions_ended': ended}, status=status.HTTP_200_OK)


class PatientLockStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        patient = get_object_or_404(Patient, pk=pk)
        is_unlocked, unlock_obj = is_patient_unlocked_for_user(request.user, patient.id)
        return Response({
            'patient_id': patient.id,
            'locked': not is_unlocked,
            'unlocked': is_unlocked,
            'expires_at': unlock_obj.expires_at.isoformat() if unlock_obj else None,
            'pin_required': bool(getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False)),
        })


class PatientAccessLogView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        if not _is_pin_admin(request.user):
            return Response({'detail': 'Admin or super_admin privileges required.'}, status=status.HTTP_403_FORBIDDEN)
        patient = get_object_or_404(Patient, pk=pk)
        events = (
            PatientFileAccessEvent.objects.filter(patient=patient)
            .select_related('staff', 'actor', 'patient')
            .order_by('-created_at')[:200]
        )
        return Response({
            'patient_id': patient.id,
            'results': [_serialize_access_event(ev) for ev in events],
        })


class DutyPINListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_pin_admin(request.user):
            return Response({'detail': 'Admin or super_admin privileges required.'}, status=status.HTTP_403_FORBIDDEN)
        qs = DutyPIN.objects.select_related('staff').order_by('-window_start', '-generated_at')
        staff_id = request.query_params.get('staff_id')
        roster_assignment_id = request.query_params.get('roster_assignment_id')
        booking_id = request.query_params.get('booking_id')
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        if roster_assignment_id:
            qs = qs.filter(roster_assignment_id=roster_assignment_id)
        if booking_id:
            qs = qs.filter(booking_id=booking_id)
        return Response({'results': [_serialize_duty_pin_summary(p) for p in qs[:100]]})


class DutyPINRevealView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        if not _is_pin_admin(request.user):
            return Response({'detail': 'Admin or super_admin privileges required.'}, status=status.HTTP_403_FORBIDDEN)
        duty_pin = get_object_or_404(DutyPIN.objects.select_related('staff'), pk=pk)
        raw_pin = reveal_pin(duty_pin, request.user)
        data = _serialize_duty_pin_summary(duty_pin)
        data['pin'] = raw_pin
        return Response(data)


class DutyPINRegenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if not _is_pin_admin(request.user):
            return Response({'detail': 'Admin or super_admin privileges required.'}, status=status.HTTP_403_FORBIDDEN)
        duty_pin = get_object_or_404(DutyPIN.objects.select_related('staff'), pk=pk)
        new_pin_obj, raw_pin = regenerate_pin(duty_pin, request.user)
        data = _serialize_duty_pin_summary(new_pin_obj)
        data['pin'] = raw_pin
        return Response(data, status=status.HTTP_201_CREATED)


class DutyPINRevokeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if not _is_pin_admin(request.user):
            return Response({'detail': 'Admin or super_admin privileges required.'}, status=status.HTTP_403_FORBIDDEN)
        duty_pin = get_object_or_404(DutyPIN.objects.select_related('staff'), pk=pk)
        reason = (request.data.get('reason') or 'admin_revoked').strip()
        revoke_pin(duty_pin, actor=request.user, reason=reason)
        return Response(_serialize_duty_pin_summary(duty_pin))


class StaffAccessLogView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        if not _is_pin_admin(request.user):
            return Response({'detail': 'Admin or super_admin privileges required.'}, status=status.HTTP_403_FORBIDDEN)
        staff = get_object_or_404(StaffMember, pk=pk)
        events = (
            PatientFileAccessEvent.objects.filter(staff=staff)
            .select_related('staff', 'actor', 'patient')
            .order_by('-created_at')[:200]
        )
        return Response({
            'staff_id': staff.id,
            'results': [_serialize_access_event(ev) for ev in events],
        })

