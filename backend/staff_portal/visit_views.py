"""
Nurse Portal — Visit Flow Endpoints
====================================

POST /api/staff-portal/visit/start/   — Start Visit (check-in)
POST /api/staff-portal/visit/end/     — End Visit (check-out)
GET  /api/staff-portal/visit/active/  — Active visit for logged-in nurse
GET  /api/staff-portal/visit/log/     — Visit log (admin/CM/doctor/super_admin)

Unified with tracking check-in/out:
- One shared booking transition function (`transition_booking_to_in_progress`, `transition_booking_to_completed`)
- Reuses `tracking.views._haversine_distance_meters` (no duplicate copy)
- Reuses central `homecareOS.permissions.get_user_role` for role checks
- Full 2-way consistency with mobile GeofenceEvent / LiveVisit
"""

import datetime
from zoneinfo import ZoneInfo
from django.utils import timezone
from django.conf import settings
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from .models import NurseVisit
from patients.scoping import get_assigned_patient_ids_for_user, is_field_nurse_user, staff_booking_q
from staff.models import StaffMember, RosterAssignment
from homecareOS.permissions import get_user_role
from tracking.views import _haversine_distance_meters as haversine_distance_meters
from bookings.models import Booking, BookingStatus
from bookings.services import (
    transition_booking_to_in_progress,
    transition_booking_to_completed,
)


# ── Permission & Role helpers ─────────────────────────────────────────────────

def _resolve_staff(request):
    """Return (StaffMember, None) or (None, error_response)."""
    if not request.user or not request.user.is_authenticated:
        return None, Response({'error': 'Unauthenticated.'}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        return StaffMember.objects.select_related('user').get(user=request.user), None
    except StaffMember.DoesNotExist:
        return None, Response({'error': 'No staff profile for this account.'}, status=status.HTTP_403_FORBIDDEN)


def _require_active_nurse(staff):
    """Return error string or None if nurse is active/non-trainee."""
    if not is_field_nurse_user(staff.user):
        return 'Only nurses may use the visit flow.'
    lc = getattr(staff, 'lifecycle_stage', None)
    if lc == 'trainee':
        return 'Trainee nurses cannot start visits.'
    return None


def _can_see_coords(user):
    """
    Super_admin (superuser or role 'super_admin') and admin StaffMember see raw coordinates.
    All others see verification status and distance only.
    """
    role = get_user_role(user)
    return role in ('super_admin', 'admin')


def _geofence_meters():
    return float(getattr(settings, 'VISIT_GEOFENCE_METERS', 300))


def _visit_to_dict(v, include_coords=False):
    d = {
        'id': v.id,
        'booking_id': v.booking_id,
        'patient_id': v.patient_id,
        'patient_name': v.patient.full_name if v.patient_id else None,
        'nurse_id': v.nurse_id,
        'nurse_name': str(v.nurse) if v.nurse_id else None,
        'checkin_time': v.checkin_time.isoformat() if v.checkin_time else None,
        'checkin_verified': v.checkin_verified,
        'checkin_location_denied': v.checkin_location_denied,
        'checkin_outside_area': v.checkin_outside_area,
        'checkin_low_accuracy': getattr(v, 'checkin_low_accuracy', False),
        'checkin_denial_reason': v.checkin_denial_reason,
        'checkin_distance_meters': v.checkin_distance_meters,
        'checkout_time': v.checkout_time.isoformat() if v.checkout_time else None,
        'checkout_verified': v.checkout_verified,
        'checkout_location_denied': v.checkout_location_denied,
        'is_ended': v.is_ended,
        'visit_summary': v.visit_summary,
        'no_care_actions_reason': v.no_care_actions_reason,
        'vitals_count': v.vitals_count,
        'medications_count': v.medications_count,
        'notes_count': v.notes_count,
        'duration_minutes': v.duration_minutes,
        'created_at': v.created_at.isoformat() if v.created_at else None,
    }
    if include_coords:
        d.update({
            'checkin_lat': float(v.checkin_lat) if v.checkin_lat is not None else None,
            'checkin_lng': float(v.checkin_lng) if v.checkin_lng is not None else None,
            'checkin_accuracy': v.checkin_accuracy,
            'checkout_lat': float(v.checkout_lat) if v.checkout_lat is not None else None,
            'checkout_lng': float(v.checkout_lng) if v.checkout_lng is not None else None,
            'checkout_accuracy': v.checkout_accuracy,
            'checkout_distance_meters': v.checkout_distance_meters,
        })
    return d


# ── Deterministic Booking Resolution ──────────────────────────────────────────

def resolve_nurse_booking_for_visit(nurse_staff, patient_id, requested_booking_id=None, now=None):
    """
    Deterministically choose the booking for this nurse and patient:
    1. Nurse must have a published roster assignment (duty window) covering today (or around now).
    2. Eligible bookings must:
       - Be for patient_id
       - Have nurse_staff as assigned_staff OR buddy OR buddy_staff
       - Not be CANCELLED or COMPLETED
       - Fall within or overlap with the nurse's published duty window
    3. If multiple match:
       - If requested_booking_id is provided and among the eligible duty-window bookings, select it.
       - Otherwise, select the eligible booking whose scheduled_time is closest to now (abs(delta)).
         Tie-breaker: earliest scheduled_time, then lowest id.
    4. If none matches, returns (None, None, error_message).
    """
    if now is None:
        now = timezone.now()

    tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
    try:
        local_tz = ZoneInfo(tz_name)
    except Exception:
        local_tz = timezone.get_current_timezone()

    local_now = now.astimezone(local_tz)
    today = local_now.date()

    # 1. Nurse published duties around today (+/- 1 day for overnight / shift boundaries)
    assignments = list(
        RosterAssignment.objects.filter(
            Q(staff=nurse_staff) | Q(buddy_staff=nurse_staff),
            is_published=True,
            date__range=[today - datetime.timedelta(days=1), today + datetime.timedelta(days=1)],
        ).order_by('date')
    )

    if not assignments:
        return None, None, "No published duty window found for your shift today."

    # Build duty windows
    duty_windows = []
    for a in assignments:
        st = a.start_time or datetime.time(0, 0)
        et = a.end_time or datetime.time(23, 59, 59)
        d_start = timezone.make_aware(datetime.datetime.combine(a.date, st), local_tz)
        if et <= st:
            d_end = timezone.make_aware(datetime.datetime.combine(a.date + datetime.timedelta(days=1), et), local_tz)
        else:
            d_end = timezone.make_aware(datetime.datetime.combine(a.date, et), local_tz)
        duty_windows.append((d_start, d_end, a))

    # 2. Find candidate bookings for this patient (assigned or buddy)
    candidates = list(
        Booking.objects.filter(
            patient_id=patient_id
        ).filter(
            staff_booking_q(nurse_staff)
        ).exclude(
            status__in=[BookingStatus.CANCELLED, BookingStatus.COMPLETED]
        )
    )

    if not candidates:
        return None, None, "No active booking found for this patient assigned to you or with you as buddy."

    # 3. Match bookings falling within or overlapping with nurse's published duty window
    eligible = []
    for b in candidates:
        if not b.scheduled_time:
            continue
        b_start = b.scheduled_time.astimezone(local_tz)
        duration_hrs = b.shift_duration or 8
        b_end = b.shift_end_time.astimezone(local_tz) if b.shift_end_time else b_start + datetime.timedelta(hours=duration_hrs)

        # Check overlap with any duty window
        matched_assign = None
        for d_start, d_end, a in duty_windows:
            if b_start <= d_end and b_end >= d_start:
                matched_assign = a
                break
            if b_start.date() == a.date:
                matched_assign = a
                break

        if matched_assign:
            distance_seconds = abs((b.scheduled_time - now).total_seconds())
            eligible.append((b, matched_assign, distance_seconds))

    if not eligible:
        return None, None, "No matching booking found in your published duty window for this patient."

    # Sort deterministically: closest scheduled_time to now, then scheduled_time, then booking id
    eligible.sort(key=lambda item: (item[2], item[0].scheduled_time, item[0].id))

    if requested_booking_id:
        req_match = next((item for item in eligible if item[0].id == int(requested_booking_id)), None)
        if req_match:
            return req_match[0], req_match[1], None

    # Pick top deterministic match (closest to now)
    selected = eligible[0]
    return selected[0], selected[1], None


# ── 1. Start Visit ────────────────────────────────────────────────────────────

class NurseVisitStartView(APIView):
    """
    POST /api/staff-portal/visit/start/

    Body:
      patient_id         int   required
      booking_id         int   optional (resolved deterministically if omitted)
      roster_assignment_id  int   optional
      lat                float optional (None if denied)
      lng                float optional (None if denied)
      accuracy           float optional
      location_denied    bool  default false
      denial_reason      str   optional
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from patients.models import Patient
        from tracking.models import GeofenceEvent

        staff, err = _resolve_staff(request)
        if err:
            return err

        nurse_err = _require_active_nurse(staff)
        if nurse_err:
            return Response({'error': nurse_err}, status=status.HTTP_403_FORBIDDEN)

        patient_id = request.data.get('patient_id')
        if not patient_id:
            return Response(
                {'error': 'patient_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Must be assigned to this patient
        assigned_ids = get_assigned_patient_ids_for_user(request.user)
        if int(patient_id) not in assigned_ids:
            return Response(
                {'error': 'You are not assigned to this patient.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            patient = Patient.objects.get(pk=patient_id)
        except Patient.DoesNotExist:
            return Response({'error': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        requested_booking_id = request.data.get('booking_id')

        # Deterministically select booking in nurse's published duty window
        booking, auto_roster, match_err = resolve_nurse_booking_for_visit(
            staff, int(patient_id), requested_booking_id=requested_booking_id, now=now
        )
        if match_err:
            return Response({'error': match_err}, status=status.HTTP_400_BAD_REQUEST)

        # Reject double check-in: check NurseVisit AND GeofenceEvent
        existing_nv = NurseVisit.objects.filter(
            Q(booking=booking, is_ended=False) | Q(nurse=staff, patient_id=patient_id, is_ended=False)
        ).first()

        has_mobile_checkin = GeofenceEvent.objects.filter(
            booking=booking, event_type=GeofenceEvent.EventType.CHECK_IN
        ).exists() and not GeofenceEvent.objects.filter(
            booking=booking, event_type=GeofenceEvent.EventType.CHECK_OUT
        ).exists()

        if existing_nv or has_mobile_checkin:
            return Response(
                {'error': 'You already have an active visit for this patient.', 'visit_id': getattr(existing_nv, 'id', None)},
                status=status.HTTP_409_CONFLICT,
            )

        location_denied = bool(request.data.get('location_denied', False))
        denial_reason = request.data.get('denial_reason', '')
        lat = request.data.get('lat')
        lng = request.data.get('lng')
        accuracy = request.data.get('accuracy')

        patient_lat = patient.latitude if patient.latitude is not None else booking.latitude
        patient_lng = patient.longitude if patient.longitude is not None else booking.longitude
        radius = _geofence_meters()

        checkin_verified = False
        checkin_outside = False
        checkin_low_accuracy = False
        distance = None

        if location_denied:
            location_status = 'denied'
            final_reason = denial_reason or 'nurse denied location'
        elif lat is None or lng is None:
            location_status = 'denied'
            final_reason = denial_reason or 'location coordinates not provided'
        elif patient_lat is None or patient_lng is None:
            # Patient / booking has no saved coordinates
            # Allowed and marked "location not verified: no patient coordinates", never verified and never outside area
            location_status = 'location not verified: no patient coordinates'
            final_reason = 'location not verified: no patient coordinates'
        else:
            distance = round(haversine_distance_meters(lat, lng, patient_lat, patient_lng), 1)
            acc = float(accuracy) if accuracy is not None else None

            if acc is not None and acc > radius:
                # Poor accuracy (accuracy larger than VISIT_GEOFENCE_METERS): marked "low accuracy" instead of outside area
                checkin_low_accuracy = True
                location_status = 'low accuracy'
                final_reason = 'location not verified: low accuracy'
            elif distance <= radius:
                checkin_verified = True
                location_status = 'verified'
                final_reason = ''
            else:
                checkin_outside = True
                location_status = 'outside_area'
                final_reason = f'Outside geofence area ({distance}m > {radius}m)'

        roster_id = request.data.get('roster_assignment_id') or (auto_roster.id if auto_roster else None)

        visit = NurseVisit.objects.create(
            booking=booking,
            nurse=staff,
            patient=patient,
            roster_assignment_id=roster_id,
            checkin_time=now,
            checkin_lat=lat if not location_denied else None,
            checkin_lng=lng if not location_denied else None,
            checkin_accuracy=float(accuracy) if accuracy is not None else None,
            checkin_distance_meters=distance,
            checkin_verified=checkin_verified,
            checkin_location_denied=location_denied,
            checkin_denial_reason=final_reason,
            checkin_outside_area=checkin_outside,
            checkin_low_accuracy=checkin_low_accuracy,
        )

        # Create matching GeofenceEvent so mobile tracking sees the web check-in
        p_lat = lat if (lat is not None and not location_denied) else (patient_lat or 0)
        p_lng = lng if (lng is not None and not location_denied) else (patient_lng or 0)
        GeofenceEvent.objects.create(
            booking=booking,
            staff=staff,
            event_type=GeofenceEvent.EventType.CHECK_IN,
            timestamp=now,
            latitude=p_lat,
            longitude=p_lng,
            notes='Check-in via web portal' if not location_denied else 'Check-in via web portal (location denied)',
        )

        # Single source of truth for booking status change
        transition_booking_to_in_progress(booking, now)

        return Response({
            'visit': _visit_to_dict(visit, include_coords=_can_see_coords(request.user)),
            'location_status': location_status,
            'distance_meters': distance,
            'geofence_meters': radius,
        }, status=status.HTTP_201_CREATED)


# ── 2. End Visit ──────────────────────────────────────────────────────────────

class NurseVisitEndView(APIView):
    """
    POST /api/staff-portal/visit/end/

    Body:
      visit_id              int   required
      lat                   float optional
      lng                   float optional
      accuracy              float optional
      location_denied       bool  default false
      denial_reason         str   optional
      visit_summary         str   optional
      no_care_actions_reason str  optional
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from patients.models import VitalSign, NurseNote, MARAdministration
        from tracking.models import GeofenceEvent, LiveVisit

        staff, err = _resolve_staff(request)
        if err:
            return err

        nurse_err = _require_active_nurse(staff)
        if nurse_err:
            return Response({'error': nurse_err}, status=status.HTTP_403_FORBIDDEN)

        visit_id = request.data.get('visit_id')
        if not visit_id:
            return Response({'error': 'visit_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            visit = NurseVisit.objects.select_related(
                'booking__patient', 'patient', 'nurse'
            ).get(pk=visit_id, nurse=staff)
        except NurseVisit.DoesNotExist:
            return Response({'error': 'Visit not found or not yours.'}, status=status.HTTP_404_NOT_FOUND)

        if visit.is_ended:
            return Response(
                {'error': 'Visit is already ended.', 'visit_id': visit.id},
                status=status.HTTP_409_CONFLICT,
            )

        location_denied = bool(request.data.get('location_denied', False))
        denial_reason = request.data.get('denial_reason', '')
        lat = request.data.get('lat')
        lng = request.data.get('lng')
        accuracy = request.data.get('accuracy')

        checkout_verified = False
        distance = None

        if not location_denied and lat is not None and lng is not None:
            patient = visit.patient
            p_lat = patient.latitude if patient.latitude is not None else visit.booking.latitude
            p_lng = patient.longitude if patient.longitude is not None else visit.booking.longitude
            if p_lat is not None and p_lng is not None:
                distance = round(haversine_distance_meters(lat, lng, p_lat, p_lng), 1)
                if distance <= _geofence_meters():
                    checkout_verified = True

        now = timezone.now()
        since = visit.checkin_time

        # Count clinical records added since check-in
        vitals_count = VitalSign.objects.filter(
            patient=visit.patient,
            recorded_by=staff,
            recorded_at__gte=since,
            is_entered_in_error=False,
        ).count()
        notes_count = NurseNote.objects.filter(
            patient=visit.patient,
            recorded_by=staff,
            recorded_at__gte=since,
            is_entered_in_error=False,
        ).count()
        meds_count = MARAdministration.objects.filter(
            prescription__patient=visit.patient,
            administered_by=staff,
            administered_at__gte=since,
            is_entered_in_error=False,
        ).count()

        visit.checkout_time = now
        visit.checkout_lat = lat if not location_denied else None
        visit.checkout_lng = lng if not location_denied else None
        visit.checkout_accuracy = float(accuracy) if accuracy is not None else None
        visit.checkout_distance_meters = distance
        visit.checkout_verified = checkout_verified
        visit.checkout_location_denied = location_denied
        visit.checkout_denial_reason = denial_reason if location_denied else ''
        visit.is_ended = True
        visit.visit_summary = request.data.get('visit_summary', '')
        visit.no_care_actions_reason = request.data.get('no_care_actions_reason', '')
        visit.vitals_count = vitals_count
        visit.medications_count = meds_count
        visit.notes_count = notes_count
        visit.save()

        # Create matching GeofenceEvent(CHECK_OUT)
        p_lat = lat if (lat is not None and not location_denied) else (visit.patient.latitude or visit.booking.latitude or 0)
        p_lng = lng if (lng is not None and not location_denied) else (visit.patient.longitude or visit.booking.longitude or 0)
        GeofenceEvent.objects.create(
            booking=visit.booking,
            staff=staff,
            event_type=GeofenceEvent.EventType.CHECK_OUT,
            timestamp=now,
            latitude=p_lat,
            longitude=p_lng,
            notes='Check-out via web portal',
        )

        LiveVisit.objects.filter(booking=visit.booking).delete()
        staff.status = 'available'
        staff.save(update_fields=['status'])

        # Single source of truth for booking status change
        transition_booking_to_completed(visit.booking, now)

        return Response({
            'visit': _visit_to_dict(visit, include_coords=_can_see_coords(request.user)),
            'summary': {
                'vitals': vitals_count,
                'medications': meds_count,
                'notes': notes_count,
                'duration_minutes': visit.duration_minutes,
            },
            'location_status': (
                'denied' if location_denied
                else ('verified' if checkout_verified else 'not_verified')
            ),
        })


# ── 3. Active Visit ───────────────────────────────────────────────────────────

class NurseVisitActiveView(APIView):
    """
    GET /api/staff-portal/visit/active/
    Returns the nurse's active (not ended) visit, or None if none.
    A nurse can read only their own active visit.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        staff, err = _resolve_staff(request)
        if err:
            return err

        # Strictly scoped to logged-in nurse only
        visit = (
            NurseVisit.objects
            .select_related('patient', 'nurse', 'booking')
            .filter(nurse=staff, is_ended=False)
            .order_by('-checkin_time')
            .first()
        )
        if not visit:
            return Response({'active_visit': None}, status=status.HTTP_200_OK)

        return Response({
            'active_visit': _visit_to_dict(visit, include_coords=_can_see_coords(request.user))
        })


# ── 4. Visit Log ──────────────────────────────────────────────────────────────

class NurseVisitLogView(APIView):
    """
    GET /api/staff-portal/visit/log/?patient_id=X&staff_id=Y&date=YYYY-MM-DD
    Restricted to: admin, super_admin, care_manager, doctor.
    Forbidden (403): branch_manager, nurse, trainee, accountant, crm_executive, patient_family.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = get_user_role(user)
        staff = getattr(user, 'staffmember', None)
        is_trainee = bool(staff and getattr(staff, 'lifecycle_stage', None) == 'trainee')

        # Strictly restricted to super_admin, admin, care_manager, doctor (non-trainee)
        if is_trainee or role not in ('super_admin', 'admin', 'care_manager', 'doctor'):
            return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

        qs = NurseVisit.objects.select_related('patient', 'nurse', 'booking').all()

        patient_id = request.query_params.get('patient_id')
        staff_id = request.query_params.get('staff_id')
        date_str = request.query_params.get('date')

        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        if staff_id:
            qs = qs.filter(nurse_id=staff_id)
        if date_str:
            try:
                from datetime import date
                d = date.fromisoformat(date_str)
                qs = qs.filter(checkin_time__date=d)
            except ValueError:
                pass

        qs = qs.order_by('-checkin_time')[:100]
        include_coords = _can_see_coords(user)

        return Response({'visits': [_visit_to_dict(v, include_coords=include_coords) for v in qs]})
