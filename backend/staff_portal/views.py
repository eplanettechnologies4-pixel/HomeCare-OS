import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.conf import settings
from django.core import signing
from django.db import models
from django.db.models import Q
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from accounts.models import AuditLog
from bookings.models import Booking, BookingStatus, ServiceMode, ServiceType
from homecareOS.permissions import (
    IsAdminOrSuperAdmin,
    IsFinancialStaff,
    IsPatientOrFamilyOwner,
    get_user_role,
    is_family_user,
)
from notifications.models import Notification
from notifications.views import create_notification
from patients.models import DoctorNote, Patient, PhysioNote, VitalSign, ShiftHandoverNote, Prescription, MARAdministration, PatientActiveComplaint
from patients.serializers import ShiftHandoverNoteSerializer
from patients.record_integrity import handle_mark_entered_in_error
from patients.scoping import is_field_nurse_user, check_nurse_patient_access, get_assigned_patient_ids_for_user, staff_booking_q
from staff_portal.duty_countdown import (
    calculate_duty_countdown,
    derive_shift_name,
    format_12hr_time,
    build_maps_link,
)
from quality.models import ManagerVisitChecklist
from staff.models import AttendanceRecord, LeaveRequest, StaffMember, RosterAssignment, RosterWeek

from .models import (
    CompanyPolicy,
    Complaint,
    FamilyConcern,
    OvertimeClaim,
    PolicyAcknowledgement,
    ResignationRequest,
    StaffRequest,
)
from .serializers import (
    CompanyPolicySerializer,
    ComplaintSerializer,
    DoctorNoteSerializer,
    FamilyConcernCreateSerializer,
    FamilyConcernRespondSerializer,
    FamilyConcernSerializer,
    OvertimeClaimSerializer,
    PermissionRequestSerializer,
    PhysioNoteSerializer,
    PublicStaffVerifySerializer,
    ResignationRequestSerializer,
    StaffRequestCreateSerializer,
    StaffRequestSerializer,
)


class StandardResultsPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class StaffPortalPostThrottle(UserRateThrottle):
    scope = 'staff_portal_post'


class StaffVerifyRateThrottle(AnonRateThrottle):
    scope = 'staff_verify'


def _resolve_staff_member(user):
    """Safely retrieves the StaffMember linked to the authenticated user."""
    if not user or not user.is_authenticated:
        return None
    return getattr(user, 'staffmember', None)


def _derive_shift_label(start_time, end_time, tz=None):
    """
    Derives whether a shift is a Day or Night shift from the actual start hour in the office timezone.
    Start hour 06:00 to 17:59 => Day shift
    Start hour 18:00 to 05:59 => Night shift
    Works across midnight and across timezones.
    """
    if tz:
        start_local = start_time.astimezone(tz)
    else:
        start_local = start_time
    hour = start_local.hour
    period = "Day shift" if (6 <= hour < 18) else "Night shift"
    duration_hrs = max(1, round((end_time - start_time).total_seconds() / 3600))
    return f"{period} ({duration_hrs} hours)"


# ── 1. GET /api/staff-portal/home/ ─────────────────────────────────────────────

class StaffPortalHomeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response(
                {'detail': 'Authenticated user is not linked to an active staff member profile.'},
                status=status.HTTP_403_FORBIDDEN
            )

        now = timezone.now()
        tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
        try:
            local_tz = ZoneInfo(tz_name)
        except Exception:
            local_tz = timezone.get_current_timezone()

        local_now = now.astimezone(local_tz)

        # 1. Office hours: computed on server strictly in office timezone (ZoneInfo)
        office_start_str = getattr(settings, 'OFFICE_HOURS_START', '09:00')
        office_end_str = getattr(settings, 'OFFICE_HOURS_END', '17:00')
        start_hour, start_min = map(int, office_start_str.split(':')[:2])
        end_hour, end_min = map(int, office_end_str.split(':')[:2])

        office_start_time = datetime.time(start_hour, start_min)
        office_end_time = datetime.time(end_hour, end_min)
        is_open_now = (office_start_time <= local_now.time() <= office_end_time)

        office_hours = {
            'start': office_start_str,
            'end': office_end_str,
            'timezone': tz_name,
            'is_open_now': is_open_now,
            'status_label': 'Open now' if is_open_now else 'Closed, opens 9:00 AM',
        }

        # 2. Staff info
        role_label = staff.designation or staff.get_role_display() or 'Registered Nurse (RN)'
        photo_url = staff.photo.url if staff.photo else None
        staff_data = {
            'id': staff.id,
            'name': staff.full_name,
            'role_label': role_label,
            'employee_id': staff.employee_id,
            'photo_url': photo_url,
            'phone': staff.phone,
        }

        # 3. Duty status and active/upcoming shift
        active_booking = (
            Booking.objects.filter(
                Q(assigned_staff=staff) | Q(buddy=staff),
                status__in=[BookingStatus.IN_PROGRESS, BookingStatus.ASSIGNED, BookingStatus.EN_ROUTE],
            )
            .filter(
                scheduled_time__lte=now + datetime.timedelta(hours=2),
            )
            .order_by('scheduled_time')
            .first()
        )

        next_booking = (
            Booking.objects.filter(
                Q(assigned_staff=staff) | Q(buddy=staff),
                scheduled_time__gt=now,
                status__in=[BookingStatus.PENDING, BookingStatus.ASSIGNED],
            )
            .order_by('scheduled_time')
            .first()
        )

        duty_state = 'off_duty'
        current_shift_data = None
        time_left_seconds = 0

        target_booking = active_booking or next_booking

        if active_booking:
            shift_start = active_booking.scheduled_time
            if active_booking.shift_end_time:
                shift_end = active_booking.shift_end_time
            else:
                hours = 12 if '12' in active_booking.shift_duration else (8 if '8' in active_booking.shift_duration else 4)
                shift_end = shift_start + datetime.timedelta(hours=hours)

            # Derive label strictly from actual start hour in the office timezone
            derived_label = _derive_shift_label(shift_start, shift_end, tz=local_tz)

            is_ended = (now > shift_end)
            if shift_start <= now <= shift_end or (active_booking.status == BookingStatus.IN_PROGRESS and not is_ended):
                duty_state = 'on_duty'
                time_left_seconds = max(0, int((shift_end - now).total_seconds()))
            elif is_ended:
                duty_state = 'on_duty'  # Shift finished during active booking
                time_left_seconds = 0
            elif now < shift_start:
                duty_state = 'upcoming'
                time_left_seconds = max(0, int((shift_start - now).total_seconds()))

            current_shift_data = {
                'id': active_booking.id,
                'start': shift_start.isoformat(),
                'end': shift_end.isoformat(),
                'type': derived_label,
                'break_minutes': active_booking.break_minutes or 30,
                'is_ended': is_ended,
            }
        elif next_booking:
            duty_state = 'upcoming'
            shift_start = next_booking.scheduled_time
            if next_booking.shift_end_time:
                shift_end = next_booking.shift_end_time
            else:
                hours = 12 if '12' in next_booking.shift_duration else (8 if '8' in next_booking.shift_duration else 4)
                shift_end = shift_start + datetime.timedelta(hours=hours)

            derived_label = _derive_shift_label(shift_start, shift_end, tz=local_tz)
            time_left_seconds = max(0, int((shift_start - now).total_seconds()))
            current_shift_data = {
                'id': next_booking.id,
                'start': shift_start.isoformat(),
                'end': shift_end.isoformat(),
                'type': derived_label,
                'break_minutes': next_booking.break_minutes or 30,
                'is_ended': False,
            }

        next_shift_data = None
        if next_booking and (not active_booking or next_booking.id != active_booking.id):
            n_start = next_booking.scheduled_time
            n_end = next_booking.shift_end_time or (n_start + datetime.timedelta(hours=8))
            next_shift_data = {
                'id': next_booking.id,
                'start': n_start.isoformat(),
                'type': _derive_shift_label(n_start, n_end, tz=local_tz),
            }

        # Fallback to published roster assignment for today if no direct booking active
        if duty_state == 'off_duty':
            today_roster = RosterAssignment.objects.filter(
                staff=staff,
                date=local_now.date(),
                is_published=True,
                is_off=False,
            ).first()
            if today_roster:
                st_time = today_roster.start_time or datetime.time(8, 0)
                en_time = today_roster.end_time or datetime.time(16, 0)
                try:
                    shift_start = timezone.make_aware(datetime.datetime.combine(today_roster.date, st_time), timezone=local_tz)
                    shift_end = timezone.make_aware(
                        datetime.datetime.combine(today_roster.date + (datetime.timedelta(days=1) if en_time <= st_time else datetime.timedelta()), en_time),
                        timezone=local_tz
                    )
                except Exception:
                    shift_start = datetime.datetime.combine(today_roster.date, st_time)
                    shift_end = datetime.datetime.combine(today_roster.date, en_time)

                duty_state = 'on_duty'
                time_left_seconds = max(0, int((shift_end - now).total_seconds())) if now < shift_end else 0
                current_shift_data = {
                    'id': f"roster_{today_roster.id}",
                    'start': shift_start.isoformat(),
                    'end': shift_end.isoformat(),
                    'type': today_roster.shift_name,
                    'break_minutes': 30,
                    'is_ended': bool(now > shift_end),
                }

        duty_info = {
            'state': duty_state,
            'shift': current_shift_data,
            'time_left_seconds': time_left_seconds,
            'is_ended': bool(current_shift_data and current_shift_data.get('is_ended', False)),
            'next_shift': next_shift_data,
        }

        # 4. Patient profile (current or next)
        patient_data = None
        supervisor_data = None
        transport_data = None
        buddy_data = None
        handover_notes = ''

        thresholds = getattr(settings, 'VITALS_THRESHOLDS', {})
        sys_max = thresholds.get('systolic_max', 140)
        sys_min = thresholds.get('systolic_min', 90)
        dia_max = thresholds.get('diastolic_max', 90)
        dia_min = thresholds.get('diastolic_min', 60)
        hr_max = thresholds.get('heart_rate_max', 100)
        hr_min = thresholds.get('heart_rate_min', 50)
        spo2_min = thresholds.get('spo2_min', 92)

        if target_booking:
            p = target_booking.patient

            # Query recent vitals for patient details card and sparkline
            recent_patient_vitals = list(
                VitalSign.objects.filter(patient=p, is_entered_in_error=False).order_by('-recorded_at')[:6]
            )

            latest_v = recent_patient_vitals[0] if recent_patient_vitals else None
            latest_vitals_dict = None
            if latest_v:
                is_bp_abnormal = bool(
                    (latest_v.blood_pressure_systolic and (latest_v.blood_pressure_systolic > sys_max or latest_v.blood_pressure_systolic < sys_min)) or
                    (latest_v.blood_pressure_diastolic and (latest_v.blood_pressure_diastolic > dia_max or latest_v.blood_pressure_diastolic < dia_min))
                )
                is_hr_abnormal = bool(latest_v.heart_rate and (latest_v.heart_rate > hr_max or latest_v.heart_rate < hr_min))
                is_spo2_abnormal = bool(latest_v.spo2 and latest_v.spo2 < spo2_min)
                is_temp_abnormal = bool(latest_v.temperature and (latest_v.temperature > 37.8 or latest_v.temperature < 36.0))

                latest_vitals_dict = {
                    'bp': f"{latest_v.blood_pressure_systolic}/{latest_v.blood_pressure_diastolic or '-'}" if latest_v.blood_pressure_systolic else '-',
                    'bp_abnormal': is_bp_abnormal,
                    'hr': latest_v.heart_rate or '-',
                    'hr_abnormal': is_hr_abnormal,
                    'spo2': f"{latest_v.spo2}%" if latest_v.spo2 else '-',
                    'spo2_abnormal': is_spo2_abnormal,
                    'temp': f"{latest_v.temperature}°C" if latest_v.temperature else '-',
                    'temp_abnormal': is_temp_abnormal,
                    'recorded_at': latest_v.recorded_at.isoformat(),
                }

            # Tiny sparkline series (oldest to newest)
            sparkline_points = []
            for pv in reversed(recent_patient_vitals):
                if pv.heart_rate:
                    sparkline_points.append(pv.heart_rate)
                elif pv.blood_pressure_systolic:
                    sparkline_points.append(pv.blood_pressure_systolic)

            open_family_concerns = FamilyConcern.objects.filter(
                patient=p,
                status=FamilyConcern.Status.OPEN,
            ).count()

            chart_counts = {
                'medication': p.prescriptions.count() if hasattr(p, 'prescriptions') else 0,
                'nursing_notes': p.nurse_notes.count() if hasattr(p, 'nurse_notes') else 0,
                'vitals': VitalSign.objects.filter(patient=p, is_entered_in_error=False).count(),
                'doctor_notes': p.doctor_notes.count() if hasattr(p, 'doctor_notes') else 0,
                'physiotherapy': p.physio_notes.count() if hasattr(p, 'physio_notes') else 0,
                'procedure_requests': StaffRequest.objects.filter(patient=p, request_type=StaffRequest.RequestType.PROCEDURE_CHANGE).count(),
                'manager_checklist': 1 if getattr(p, 'assigned_care_manager', None) else 0,
                'family_concerns': open_family_concerns,
            }

            patient_data = {
                'id': p.id,
                'name': p.full_name,
                'diagnosis': p.primary_diagnosis or target_booking.diagnosis or 'Under clinical observation',
                'location': p.address or target_booking.address,
                'patient_code': p.patient_code or f"PT-{p.id}",
                'mr_number': p.mr_number,
                'age': p.age or target_booking.patient_age,
                'allergy_status': getattr(p, 'allergy_status', 'not_recorded'),
                'allergy_status_display': p.get_allergy_status_display() if hasattr(p, 'get_allergy_status_display') else 'Allergies not recorded',
                'allergies': getattr(p, 'allergies', None) or '',
                'latest_vitals': latest_vitals_dict,
                'sparkline': sparkline_points,
                'chart_counts': chart_counts,
                'latitude': float(p.latitude) if p.latitude else None,
                'longitude': float(p.longitude) if p.longitude else None,
            }

            if target_booking.supervisor:
                supervisor_data = {
                    'name': target_booking.supervisor.full_name,
                    'phone': target_booking.supervisor.phone,
                }
            elif p.assigned_care_manager:
                supervisor_data = {
                    'name': p.assigned_care_manager.full_name,
                    'phone': p.assigned_care_manager.phone,
                }

            driver_name = (
                getattr(target_booking, 'transport_driver_name', '') or
                target_booking.driver_name or
                getattr(staff, 'transport_driver_name', '') or
                ''
            )
            driver_phone = (
                getattr(target_booking, 'transport_driver_phone', '') or
                target_booking.driver_phone or
                getattr(staff, 'transport_driver_phone', '') or
                ''
            )

            # Pickup time formatting: clean string or None (prevents Invalid Date in browser)
            raw_pickup = (
                getattr(target_booking, 'transport_pickup_time', '') or
                (target_booking.pickup_time.strftime('%I:%M %p') if target_booking.pickup_time else '') or
                getattr(staff, 'transport_pickup_time', '') or
                ''
            )
            pickup_time = raw_pickup if (raw_pickup and str(raw_pickup).strip()) else None

            transport_data = {
                'driver_name': driver_name or 'Nadeem Khan',
                'driver_phone': driver_phone or '+92-300-4445555',
                'pickup_time': pickup_time,
            }

            buddy_obj = (
                getattr(target_booking, 'buddy_staff', None) or
                target_booking.buddy or
                getattr(staff, 'buddy_staff', None)
            )
            if buddy_obj and buddy_obj.id != staff.id:
                buddy_data = {
                    'name': buddy_obj.full_name,
                    'phone': buddy_obj.phone,
                }

            handover_notes = target_booking.handover_notes or ''

        # 5. Alerts derivation
        alerts_raw = []
        from patients.scoping import staff_booking_q
        assigned_patient_ids = list(
            Booking.objects.filter(staff_booking_q(staff))
            .exclude(status=BookingStatus.CANCELLED)
            .values_list('patient_id', flat=True)
            .distinct()
        )

        thresholds = getattr(settings, 'VITALS_THRESHOLDS', {})
        intake_min = thresholds.get('intake_min_ml', 500)
        output_min = thresholds.get('output_min_ml', 400)

        # 5a. Critical vitals in last 48h
        recent_vitals = (
            VitalSign.objects.filter(
                patient_id__in=assigned_patient_ids,
                recorded_at__gte=now - datetime.timedelta(hours=48),
                is_entered_in_error=False,
            )
            .select_related('patient')
            .order_by('-recorded_at')[:10]
        )


        for v in recent_vitals:
            is_abnormal = False
            reasons = []
            if v.blood_pressure_systolic and (v.blood_pressure_systolic > sys_max or v.blood_pressure_systolic < sys_min):
                is_abnormal = True
                reasons.append(f"BP {v.blood_pressure_systolic}/{v.blood_pressure_diastolic or '-'}")
            if v.heart_rate and (v.heart_rate > hr_max or v.heart_rate < hr_min):
                is_abnormal = True
                reasons.append(f"HR {v.heart_rate} bpm")
            if v.spo2 and v.spo2 < spo2_min:
                is_abnormal = True
                reasons.append(f"SpO2 {v.spo2}%")

            if is_abnormal:
                alerts_raw.append({
                    'id': f"vital-{v.id}",
                    'type': 'high_vitals',
                    'severity': 'high',
                    'title': f"Abnormal Vitals for {v.patient.full_name}: {', '.join(reasons)}",
                    'patient_id': v.patient.id,
                    'source_record': 'vitals',
                    'created_at': v.recorded_at.isoformat(),
                    'target': 'vitals',
                })

            if (v.intake_ml is not None and v.intake_ml < intake_min) or (v.output_ml is not None and v.output_ml < output_min):
                alerts_raw.append({
                    'id': f"intake-{v.id}",
                    'type': 'poor_intake',
                    'severity': 'medium',
                    'title': f"Low Fluid Balance ({v.patient.full_name}): In {v.intake_ml or 0}ml / Out {v.output_ml or 0}ml",
                    'patient_id': v.patient.id,
                    'source_record': 'intake',
                    'created_at': v.recorded_at.isoformat(),
                    'target': 'vitals',
                })

        # 5b. Pending shift notes check
        timeout_hours = getattr(settings, 'SHIFT_NOTE_TIMEOUT_HOURS', 2)
        if duty_state == 'on_duty' and active_booking:
            shift_started = active_booking.scheduled_time
            if now >= shift_started + datetime.timedelta(hours=timeout_hours):
                has_note = active_booking.patient.nurse_notes.filter(
                    recorded_by=staff,
                    recorded_at__gte=shift_started
                ).exists()
                if not has_note:
                    alerts_raw.append({
                        'id': f"note-shift-{active_booking.id}",
                        'type': 'pending_notes',
                        'severity': 'medium',
                        'title': f"Shift note pending for {active_booking.patient.full_name} (> {timeout_hours}h elapsed)",
                        'patient_id': active_booking.patient.id,
                        'source_record': f"shift_{active_booking.id}",
                        'created_at': now.isoformat(),
                        'target': 'nursing_notes',
                    })

        # 5c. Family concerns open for nurse's patients
        open_concerns = FamilyConcern.objects.filter(
            patient_id__in=assigned_patient_ids,
            status=FamilyConcern.Status.OPEN,
        ).select_related('patient')[:5]

        for fc in open_concerns:
            alerts_raw.append({
                'id': f"concern-{fc.id}",
                'type': 'family_concern',
                'severity': 'high',
                'title': f"Family Concern ({fc.get_chart_type_display()}): {fc.patient.full_name}",
                'patient_id': fc.patient.id,
                'source_record': f"concern_{fc.id}",
                'created_at': fc.created_at.isoformat(),
                'target': fc.chart_type,
            })

        # 5d. Nurse's transcribed orders verified or rejected in last 24h
        recent_rx_verifications = Prescription.objects.filter(
            prescribed_by=staff,
            verified_at__gte=now - datetime.timedelta(hours=24),
            verification_status__in=['verified', 'rejected']
        ).select_related('patient')
        for rx in recent_rx_verifications:
            st_label = 'verified' if rx.verification_status == 'verified' else 'rejected'
            alerts_raw.append({
                'id': f"rx-verif-{rx.id}",
                'type': f'order_{st_label}',
                'severity': 'medium' if rx.verification_status == 'verified' else 'high',
                'title': f"Order for {rx.medication} ({rx.patient.full_name}) was {st_label} by doctor",
                'patient_id': rx.patient.id,
                'source_record': f"rx_{rx.id}",
                'created_at': rx.verified_at.isoformat() if rx.verified_at else now.isoformat(),
                'target': 'medications',
            })

        # 5e. Nurse Patients & Vitals Overdue Analysis
        today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
        vitals_due_hours = getattr(settings, 'NURSE_VITALS_DUE_HOURS', 4)

        nurse_patients_list = []
        vitals_overdue_list = []
        patients_today_list = []

        if assigned_patient_ids:
            from staff.pin_service import is_patient_unlocked_for_user
            assigned_patients_qs = Patient.objects.filter(
                id__in=assigned_patient_ids, is_active=True
            ).select_related('assigned_care_manager')

            for p in assigned_patients_qs:
                is_unlocked, _ = is_patient_unlocked_for_user(request.user, p.id, now=now)
                is_file_locked = not is_unlocked
                latest_v = VitalSign.objects.filter(
                    patient=p, is_entered_in_error=False
                ).order_by('-recorded_at').first() if is_unlocked else None

                tier_res = _classify_patient_vitals(latest_v, now) if is_unlocked else 'locked'
                tier = tier_res[0] if isinstance(tier_res, (tuple, list)) else tier_res
                if is_unlocked and tier in ('no_recent_vitals', None, ''):
                    tier = 'unclassified'

                has_booking_today = Booking.objects.filter(
                    staff_booking_q(staff),
                    patient=p,
                    scheduled_time__range=[today_start, today_end],
                ).exclude(status=BookingStatus.CANCELLED).exists()

                if has_booking_today and not is_file_locked:
                    patients_today_list.append({
                        'id': p.id,
                        'patient_id': p.id,
                        'name': p.full_name,
                        'mr_number': p.mr_number,
                        'age': p.age,
                        'gender': p.gender,
                        'gender_display': p.get_gender_display(),
                        'primary_diagnosis': p.primary_diagnosis or '-',
                        'allergy_status': getattr(p, 'allergy_status', 'not_recorded'),
                        'allergies': p.allergies or '',
                        'latest_tier': tier,
                    })

                    # Vitals overdue check: patient with active visit today has no non-error vitals within NURSE_VITALS_DUE_HOURS
                    is_overdue = False
                    if not latest_v:
                        is_overdue = True
                    else:
                        elapsed_hours = (now - latest_v.recorded_at).total_seconds() / 3600.0
                        if elapsed_hours >= vitals_due_hours:
                            is_overdue = True

                    if is_overdue:
                        vitals_overdue_list.append({
                            'id': p.id,
                            'patient_id': p.id,
                            'patient_name': p.full_name,
                            'mr_number': p.mr_number,
                            'last_recorded_at': latest_v.recorded_at.isoformat() if latest_v else None,
                            'hours_overdue': round((now - latest_v.recorded_at).total_seconds() / 3600.0, 1) if latest_v else None,
                            'latest_tier': tier,
                        })
                        alerts_raw.append({
                            'id': f"vitals-overdue-{p.id}",
                            'type': 'vitals_overdue',
                            'severity': 'high',
                            'title': f"Vitals Overdue for {p.full_name} (> {vitals_due_hours}h since last recorded)",
                            'patient_id': p.id,
                            'source_record': f"patient_{p.id}",
                            'created_at': now.isoformat(),
                            'target': 'vitals',
                        })

                # Active complaint
                active_comp = PatientActiveComplaint.objects.filter(patient=p, resolved_at__isnull=True).first()

                # Latest handover note in last 24h
                latest_ho = ShiftHandoverNote.objects.filter(
                    patient=p,
                    created_at__gte=now - datetime.timedelta(hours=24),
                    is_entered_in_error=False,
                ).order_by('-created_at').first()

                is_current = bool(target_booking and target_booking.patient_id == p.id)

                last_v_text = None
                if latest_v:
                    reasons_str = []
                    if latest_v.blood_pressure_systolic:
                        reasons_str.append(f"BP {latest_v.blood_pressure_systolic}/{latest_v.blood_pressure_diastolic or '-'}")
                    if latest_v.heart_rate:
                        reasons_str.append(f"HR {latest_v.heart_rate}")
                    if latest_v.spo2:
                        reasons_str.append(f"SpO2 {latest_v.spo2}%")
                    last_v_text = ' • '.join(reasons_str) if reasons_str else 'Recorded'

                nurse_patients_list.append({
                    'id': p.id,
                    'patient_id': p.id,
                    'name': p.full_name,
                    'mr_number': p.mr_number,
                    'age': p.age if not is_file_locked else None,
                    'gender': p.gender if not is_file_locked else '',
                    'gender_display': p.get_gender_display() if not is_file_locked else '',
                    'is_file_locked': is_file_locked,
                    'allergy_status': getattr(p, 'allergy_status', 'not_recorded') if not is_file_locked else 'locked',
                    'allergy_status_display': (p.get_allergy_status_display() if hasattr(p, 'get_allergy_status_display') else 'Allergies not recorded') if not is_file_locked else 'Locked — Enter Duty PIN',
                    'allergies': (p.allergies or '') if not is_file_locked else '',
                    'primary_diagnosis': (p.primary_diagnosis or 'Under clinical observation') if not is_file_locked else 'Locked — Enter Duty PIN',
                    'latest_tier': tier,
                    'last_vitals_time': latest_v.recorded_at.isoformat() if (latest_v and not is_file_locked) else None,
                    'last_vitals_text': last_v_text if not is_file_locked else None,
                    'has_active_complaint': bool(active_comp) if not is_file_locked else False,
                    'active_complaint_text': (active_comp.complaint_text if active_comp else '') if not is_file_locked else '',
                    'address': p.address or 'Address not recorded',
                    'latitude': float(p.latitude) if p.latitude else None,
                    'longitude': float(p.longitude) if p.longitude else None,
                    'latest_handover': {
                        'id': latest_ho.id,
                        'text': latest_ho.text,
                        'author_name': latest_ho.author.get_full_name() or latest_ho.author.username if latest_ho.author else 'Staff Nurse',
                        'shift_label': latest_ho.shift_label,
                        'created_at': latest_ho.created_at.isoformat(),
                    } if (latest_ho and not is_file_locked) else None,
                    'is_current_visit': is_current,
                    'is_active_today': has_booking_today,
                })

            # Sort: current visit first, then active today, then name
            nurse_patients_list.sort(key=lambda x: (not x['is_current_visit'], not x['is_active_today'], x['name']))

        # Deduplicate on server by (type + patient + source record), keeping only the latest
        alerts_raw.sort(key=lambda a: a.get('created_at', ''), reverse=True)
        deduped_alerts = []
        seen_keys = set()
        for a in alerts_raw:
            key = (a.get('type'), a.get('patient_id'), a.get('source_record'))
            if key not in seen_keys:
                seen_keys.add(key)
                deduped_alerts.append(a)

        grouped_alerts = {
            'high': [a for a in deduped_alerts if a.get('severity') == 'high'],
            'medium': [a for a in deduped_alerts if a.get('severity') == 'medium'],
            'reminder': [a for a in deduped_alerts if a.get('severity') in ['low', 'reminder']],
        }

        # Active verified medications across assigned unlocked patients
        unlocked_patient_ids = assigned_patient_ids
        if getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False) and assigned_patient_ids:
            from staff.pin_service import is_patient_unlocked_for_user
            unlocked_patient_ids = [
                pid for pid in assigned_patient_ids
                if is_patient_unlocked_for_user(request.user, pid, now=now)[0]
            ]

        active_medications_qs = Prescription.objects.filter(
            patient_id__in=unlocked_patient_ids,
            verification_status='verified',
        ).select_related('patient')

        # Nurse's own transcribed prescriptions awaiting verification
        pending_rx_qs = Prescription.objects.filter(
            prescribed_by=staff,
            verification_status='pending_verification',
        ).select_related('patient')

        # Pending notes count
        pending_notes_alerts = [a for a in deduped_alerts if a.get('type') == 'pending_notes']

        # Today's Work block
        today_work = {
            'patients_today': len(patients_today_list),
            'vitals_overdue': len(vitals_overdue_list),
            'active_medications': active_medications_qs.count(),
            'pending_verification': pending_rx_qs.count(),
            'pending_notes': len(pending_notes_alerts),
            'alerts_count': len(deduped_alerts),
            'my_patients_today': len(patients_today_list),
            'my_orders_awaiting_verification': pending_rx_qs.count(),
            'shift_notes_pending': len(pending_notes_alerts),
            'active_alerts': len(deduped_alerts),
        }

        # Latest handovers for assigned unlocked patients in last 24h
        handovers_qs = ShiftHandoverNote.objects.filter(
            patient_id__in=unlocked_patient_ids,
            created_at__gte=now - datetime.timedelta(hours=24),
            is_entered_in_error=False,
        ).select_related('patient', 'author').order_by('-created_at')
        handovers_data = ShiftHandoverNoteSerializer(handovers_qs, many=True, context={'request': request}).data

        # Shared Roster Summary & Employment Status
        roster_summary = compute_roster_summary(staff, local_now, local_tz, user=request.user)
        emp_status_block = {
            'status': staff.employment_status,
            'status_display': staff.get_employment_status_display() if staff.employment_status else 'Not set',
            'probation_end_date': staff.probation_end_date.isoformat() if staff.probation_end_date else None,
        }

        # 6. Claims summary
        month_start = local_now.date().replace(day=1)
        pending_claims = OvertimeClaim.objects.filter(staff=staff, status=OvertimeClaim.Status.PENDING).count()
        approved_claims = OvertimeClaim.objects.filter(
            staff=staff,
            status__in=[OvertimeClaim.Status.APPROVED, OvertimeClaim.Status.PAID],
            reviewed_at__date__gte=month_start,
        ).count()

        claims_summary = {
            'pending': pending_claims,
            'approved_this_month': approved_claims,
        }

        # Quick stats for hero row
        quick_stats = {
            'patients_today': len(patients_today_list),
            'pending_notes': len(pending_notes_alerts),
            'active_alerts': len(deduped_alerts),
            'claims_pending': claims_summary['pending'],
        }

        # 7. Unread notifications
        unread_notifications = Notification.objects.filter(recipient=request.user, is_read=False).count()

        import hashlib
        staff_ts = staff.updated_at.isoformat() if staff.updated_at else ''
        booking_ts = target_booking.updated_at.isoformat() if target_booking and target_booking.updated_at else ''
        patient_ts = target_booking.patient.updated_at.isoformat() if target_booking and target_booking.patient and target_booking.patient.updated_at else ''
        version_str = f"{staff.id}_{staff.full_name}_{staff.designation}_{staff_ts}_{booking_ts}_{patient_ts}_{duty_state}_{len(deduped_alerts)}_{claims_summary['pending']}_{unread_notifications}_{len(nurse_patients_list)}_{len(handovers_data)}"
        version_hash = hashlib.md5(version_str.encode('utf-8')).hexdigest()[:12]

        return Response({
            'version': version_hash,
            'updated_at': now.isoformat(),
            'server_time': now.isoformat(),
            'office_hours': office_hours,
            'staff': staff_data,
            'duty': duty_info,
            'patient': patient_data,
            'supervisor': supervisor_data,
            'transport': transport_data,
            'buddy': buddy_data,
            'handover_notes': handover_notes,
            'alerts': deduped_alerts[:5],         # Top 5 for the primary list
            'all_alerts': deduped_alerts,         # Complete deduplicated list
            'grouped_alerts': grouped_alerts,
            'quick_stats': quick_stats,
            'today_work': today_work,
            'nurse_patients': nurse_patients_list,
            'handovers': handovers_data,
            'roster_summary': roster_summary,
            'employment_status': emp_status_block,
            'claims_summary': claims_summary,
            'unread_notifications': unread_notifications,
        })


# ── Helper Functions for Clinician Portal & Roster ────────────────────────────

def _calculate_shift_hours(assign):
    """
    Computes scheduled hours for an assignment.
    Off days (is_off or shift_name 'off') -> 0.0h
    Standby days ('standby' in shift_name) -> 0.0h
    Otherwise, if start_time and end_time are present:
    Normal shift (e.g. 08:00 to 16:00) -> 8.0h
    Overnight shift (e.g. 20:00 to 08:00) -> 12.0h
    """
    if not assign or assign.is_off or assign.shift_name.strip().lower() == 'off':
        return 0.0
    if 'standby' in assign.shift_name.strip().lower():
        return 0.0
    if not assign.start_time or not assign.end_time:
        return 0.0

    start_sec = assign.start_time.hour * 3600 + assign.start_time.minute * 60 + assign.start_time.second
    end_sec = assign.end_time.hour * 3600 + assign.end_time.minute * 60 + assign.end_time.second
    if end_sec <= start_sec:
        sec_diff = (86400 - start_sec) + end_sec
    else:
        sec_diff = end_sec - start_sec
    return round(sec_diff / 3600.0, 2)


def compute_roster_summary(staff, local_now=None, local_tz=None, user=None):
    if local_tz is None:
        tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
        try:
            local_tz = ZoneInfo(tz_name)
        except Exception:
            local_tz = timezone.get_current_timezone()
    if local_now is None:
        local_now = timezone.now().astimezone(local_tz)

    today_date = local_now.date()
    days_since_monday = today_date.weekday()
    week_start = today_date - datetime.timedelta(days=days_since_monday)
    week_end = week_start + datetime.timedelta(days=6)

    import calendar
    _, last_day = calendar.monthrange(today_date.year, today_date.month)
    month_start = today_date.replace(day=1)
    month_end = today_date.replace(day=last_day)

    min_date = min(week_start, month_start, today_date - datetime.timedelta(days=1))
    max_date = max(week_end, month_end, today_date + datetime.timedelta(days=14))

    assignments = []
    if staff:
        assignments = list(
            RosterAssignment.objects.filter(
                staff=staff,
                is_published=True,
                date__range=[min_date, max_date],
            ).select_related('shift_template', 'supervisor', 'buddy_staff', 'driver').prefetch_related('patients').order_by('date')
        )

    # 1. Today's duty status
    today_assign = next((a for a in assignments if a.date == today_date), None)
    yesterday_assign = next((a for a in assignments if a.date == today_date - datetime.timedelta(days=1)), None)

    duty_status = 'Off'
    current_shift_name = 'No Shift Scheduled'
    shift_window = 'None'
    shift_location = ''
    progress_percent = 0.0

    in_overnight = False
    if yesterday_assign and yesterday_assign.start_time and yesterday_assign.end_time and (not yesterday_assign.is_off) and ('standby' not in yesterday_assign.shift_name.strip().lower()):
        if yesterday_assign.end_time <= yesterday_assign.start_time:
            y_s_dt = timezone.make_aware(datetime.datetime.combine(yesterday_assign.date, yesterday_assign.start_time), timezone=local_tz)
            y_e_dt = timezone.make_aware(datetime.datetime.combine(today_date, yesterday_assign.end_time), timezone=local_tz)
            if y_s_dt <= local_now <= y_e_dt:
                in_overnight = True
                duty_status = 'On duty'
                current_shift_name = derive_shift_name(yesterday_assign.start_time, yesterday_assign.shift_name)
                shift_window = f"{yesterday_assign.start_time.strftime('%H:%M')} - {yesterday_assign.end_time.strftime('%H:%M')}"
                shift_location = yesterday_assign.location or 'Main Hospital / Clinic'
                total_s = max(1, (y_e_dt - y_s_dt).total_seconds())
                elapsed = (local_now - y_s_dt).total_seconds()
                progress_percent = round(min(100.0, max(0.0, (elapsed / total_s) * 100.0)), 1)

    if not in_overnight:
        if today_assign:
            shift_location = today_assign.location or 'Main Hospital / Clinic'
            if today_assign.is_off or today_assign.shift_name.strip().lower() == 'off':
                duty_status = 'Off'
                current_shift_name = today_assign.shift_name or 'Off Duty'
                shift_window = 'Off'
            elif 'standby' in today_assign.shift_name.strip().lower():
                duty_status = 'Standby'
                current_shift_name = today_assign.shift_name
                shift_window = 'Standby'
            else:
                current_shift_name = derive_shift_name(today_assign.start_time, today_assign.shift_name)
                if today_assign.start_time and today_assign.end_time:
                    shift_window = f"{today_assign.start_time.strftime('%H:%M')} - {today_assign.end_time.strftime('%H:%M')}"
                    t_s_dt = timezone.make_aware(datetime.datetime.combine(today_date, today_assign.start_time), timezone=local_tz)
                    if today_assign.end_time <= today_assign.start_time:
                        t_e_dt = timezone.make_aware(datetime.datetime.combine(today_date + datetime.timedelta(days=1), today_assign.end_time), timezone=local_tz)
                    else:
                        t_e_dt = timezone.make_aware(datetime.datetime.combine(today_date, today_assign.end_time), timezone=local_tz)

                    if t_s_dt <= local_now <= t_e_dt:
                        duty_status = 'On duty'
                        total_s = max(1, (t_e_dt - t_s_dt).total_seconds())
                        elapsed = (local_now - t_s_dt).total_seconds()
                        progress_percent = round(min(100.0, max(0.0, (elapsed / total_s) * 100.0)), 1)
                    else:
                        duty_status = 'Off'
                else:
                    duty_status = 'On duty'
        else:
            duty_status = 'Off'
            current_shift_name = 'No Shift Scheduled'
            shift_window = 'None'

    # Compute target assignment for detailed today duty
    target_assign = None
    if in_overnight and yesterday_assign:
        target_assign = yesterday_assign
    elif today_assign and not today_assign.is_off and ('standby' not in today_assign.shift_name.strip().lower()):
        target_assign = today_assign

    # Next duty: find earliest published non-off upcoming duty after local_now (excluding active target_assign)
    next_duty = None
    upcoming_candidates = []
    for a in assignments:
        if target_assign and a.id == target_assign.id:
            continue
        if a.is_off or a.shift_name.strip().lower() == 'off' or 'standby' in a.shift_name.strip().lower():
            continue
        if not a.start_time:
            continue
        try:
            a_start_dt = timezone.make_aware(datetime.datetime.combine(a.date, a.start_time), timezone=local_tz)
        except Exception:
            a_start_dt = datetime.datetime.combine(a.date, a.start_time)
        if a_start_dt > local_now:
            upcoming_candidates.append((a_start_dt, a))

    if upcoming_candidates:
        upcoming_candidates.sort(key=lambda x: x[0])
        _, next_a = upcoming_candidates[0]
        derived_next_name = derive_shift_name(next_a.start_time, next_a.shift_name)
        st_12 = format_12hr_time(next_a.start_time)
        en_12 = format_12hr_time(next_a.end_time) if next_a.end_time else ''
        w_12 = f"{st_12} - {en_12}" if en_12 else st_12
        next_duty = {
            'id': next_a.id,
            'date': next_a.date.isoformat(),
            'date_formatted': next_a.date.strftime('%a, %d %b %Y'),
            'shift_name': derived_next_name,
            'window': w_12 or (f"{next_a.start_time.strftime('%H:%M')} - {next_a.end_time.strftime('%H:%M')}" if (next_a.start_time and next_a.end_time) else ''),
            'start_time': st_12,
            'end_time': en_12,
            'location': next_a.location or 'Main Hospital / Clinic',
        }

    # 2. 7-day strip (Mon-Sun)
    day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    weekly_strip = []
    week_assignments = [a for a in assignments if week_start <= a.date <= week_end]
    week_hours = 0.0

    for i in range(7):
        d_date = week_start + datetime.timedelta(days=i)
        assign = next((a for a in week_assignments if a.date == d_date), None)
        h = _calculate_shift_hours(assign)
        week_hours += h

        st = 'off'
        if assign:
            if assign.is_off or assign.shift_name.strip().lower() == 'off':
                st = 'off'
            elif 'standby' in assign.shift_name.strip().lower():
                st = 'standby'
            else:
                st = 'on'

        shift_title = 'Off'
        if assign:
            if st == 'off':
                shift_title = 'Off'
            elif st == 'standby':
                shift_title = 'Standby'
            elif assign.start_time:
                shift_title = derive_shift_name(assign.start_time, assign.shift_name)
            else:
                shift_title = assign.shift_name

        weekly_strip.append({
            'date': d_date.isoformat(),
            'day_name': day_names[i],
            'day_number': d_date.day,
            'is_today': (d_date == today_date),
            'status': st,
            'shift_name': shift_title,
            'window': f"{format_12hr_time(assign.start_time)} - {format_12hr_time(assign.end_time)}" if (assign and assign.start_time and assign.end_time) else ('Off' if st == 'off' else ('Standby' if st == 'standby' else '')),
            'hours': h,
            'patients': [p.full_name for p in assign.patients.all()] if (assign and hasattr(assign, 'patients')) else [],
            'location': assign.location if assign else '',
            'color': assign.color if assign else '#9CA3AF',
        })

    week_hours = round(week_hours, 2)

    # 3. Summary metrics
    today_hours = _calculate_shift_hours(today_assign)
    month_assignments = [a for a in assignments if month_start <= a.date <= month_end]
    month_hours = round(sum(_calculate_shift_hours(a) for a in month_assignments), 2)

    def _count_days(assign_list):
        on_cnt = 0
        off_cnt = 0
        sb_cnt = 0
        for a in assign_list:
            if a.is_off or a.shift_name.strip().lower() == 'off':
                off_cnt += 1
            elif 'standby' in a.shift_name.strip().lower():
                sb_cnt += 1
            else:
                on_cnt += 1
        return on_cnt, off_cnt, sb_cnt

    days_on_w, days_off_w, days_sb_w = _count_days(week_assignments)
    days_on_m, days_off_m, days_sb_m = _count_days(month_assignments)

    max_weekly_hours = getattr(settings, 'ROSTER_MAX_WEEKLY_HOURS', 60)
    weekly_hours_percent = round((week_hours / max_weekly_hours) * 100, 1) if max_weekly_hours else 0.0

    # Mini calendar month days
    month_days = []
    for d in range(1, last_day + 1):
        m_date = month_start.replace(day=d)
        assign = next((a for a in month_assignments if a.date == m_date), None)
        h = _calculate_shift_hours(assign)
        st = 'off'
        if assign:
            if assign.is_off or assign.shift_name.strip().lower() == 'off':
                st = 'off'
            elif 'standby' in assign.shift_name.strip().lower():
                st = 'standby'
            else:
                st = 'on'

        m_shift_title = 'Off'
        if assign:
            if st == 'off':
                m_shift_title = 'Off'
            elif st == 'standby':
                m_shift_title = 'Standby'
            elif assign.start_time:
                m_shift_title = derive_shift_name(assign.start_time, assign.shift_name)
            else:
                m_shift_title = assign.shift_name

        month_days.append({
            'date': m_date.isoformat(),
            'day_number': d,
            'is_today': (m_date == today_date),
            'status': st,
            'shift_name': m_shift_title,
            'hours': h,
            'patients': [p.full_name for p in assign.patients.all()] if (assign and hasattr(assign, 'patients')) else [],
        })

    # Detailed duty object for today's active/scheduled shift
    today_duty = None
    if target_assign and target_assign.start_time and target_assign.end_time:
        st_t = target_assign.start_time
        en_t = target_assign.end_time
        is_ov = (en_t <= st_t)
        try:
            s_dt = timezone.make_aware(datetime.datetime.combine(target_assign.date, st_t), timezone=local_tz)
            e_dt = timezone.make_aware(
                datetime.datetime.combine(target_assign.date + (datetime.timedelta(days=1) if is_ov else datetime.timedelta()), en_t),
                timezone=local_tz
            )
        except Exception:
            s_dt = datetime.datetime.combine(target_assign.date, st_t)
            e_dt = datetime.datetime.combine(target_assign.date, en_t)

        countdown_info = calculate_duty_countdown(s_dt, e_dt, local_now)

        driver_st = getattr(target_assign, 'driver', None)
        d_name = (driver_st.full_name if driver_st else None) or target_assign.transport_driver_name or None
        d_phone = (driver_st.phone if driver_st else None) or target_assign.transport_driver_phone or None
        raw_pt = (target_assign.driver_pickup_time.strftime('%I:%M %p') if getattr(target_assign, 'driver_pickup_time', None) else None) or target_assign.transport_pickup_time or None
        p_time = raw_pt if (raw_pt and str(raw_pt).strip()) else None

        sup_obj = getattr(target_assign, 'supervisor', None)
        bud_obj = target_assign.buddy_staff

        has_sup = bool(sup_obj)
        has_trans = bool(d_name or p_time)
        has_bud = bool(bud_obj)
        is_ind = not (has_sup or has_trans or has_bud)

        st_12 = format_12hr_time(st_t)
        en_12 = format_12hr_time(en_t)
        duty_time_label = f"{st_12} - {en_12}"
        derived_shift_name = derive_shift_name(st_t, target_assign.shift_name)
        shift_line_label = f"{derived_shift_name} {duty_time_label}"

        # Privacy rules:
        # A nurse sees patient contact number and location ONLY for patients on THAT nurse's own published duty
        # and ONLY inside the existing access window.
        # Nurses with no duty for that patient, trainees, and every other role (admin, super_admin, family, etc.) get none of it.
        # Staff contact numbers (supervisor, driver, buddy) follow the same rule.
        is_authorized_nurse = False
        if user and user.is_authenticated and staff:
            user_staff = getattr(user, 'staffmember', None)
            if user_staff and user_staff.id == staff.id:
                if is_field_nurse_user(user):
                    if getattr(staff, 'lifecycle_stage', None) != 'trainee':
                        is_authorized_nurse = True

        assigned_pats = list(target_assign.patients.all()) if hasattr(target_assign, 'patients') else []
        assigned_pids = (get_assigned_patient_ids_for_user(user, now=local_now) or set()) if user else set()
        days_cutoff = getattr(settings, 'NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT', 7)
        duty_in_window = (target_assign.date >= (today_date - datetime.timedelta(days=days_cutoff)))

        pats_list = []
        from staff.pin_service import is_patient_unlocked_for_user
        for p in assigned_pats:
            is_unlocked = is_patient_unlocked_for_user(user, p.id, now=local_now)[0] if user else True
            is_patient_in_window = (
                is_authorized_nurse and
                target_assign.is_published and
                (p.id in assigned_pids or (duty_in_window and target_assign.patients.filter(id=p.id).exists()))
            )

            p_addr = p.address or ''
            if is_patient_in_window:
                m_link = build_maps_link(patient=p, address=p_addr)
                contact_num = p.phone or ''
                loc_val = p_addr
            else:
                m_link = None
                contact_num = None
                loc_val = None

            pats_list.append({
                'id': p.id,
                'name': p.full_name,
                'age': p.age,
                'mr_number': getattr(p, 'mr_number', '') or '',
                'diagnosis': 'Locked — Enter Duty PIN' if (getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False) and user and not is_unlocked) else (p.primary_diagnosis or 'Not recorded'),
                'location': loc_val,
                'maps_link': m_link,
                'contact_number': contact_num,
                'is_file_locked': bool(getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False) and user and not is_unlocked),
            })

        # Staff phone numbers follow the exact same privacy rule
        can_view_staff_phones = is_authorized_nurse and target_assign.is_published

        today_duty = {
            'id': target_assign.id,
            'shift_name': derived_shift_name,
            'start_time': st_12,
            'end_time': en_12,
            'duty_time': duty_time_label,
            'shift_line': shift_line_label,
            'is_overnight': is_ov,
            'countdown': countdown_info,
            'patients': pats_list,
            'empty_patients_label': '' if pats_list else 'Shift only, no patient assigned yet',
            'supervisor': {
                'name': sup_obj.full_name,
                'phone': (sup_obj.phone if can_view_staff_phones else None),
            } if has_sup else None,
            'transport': {
                'driver_name': d_name,
                'driver_phone': (d_phone if can_view_staff_phones else None),
                'pickup_time': p_time or '',
            } if has_trans else None,
            'buddy': {
                'name': bud_obj.full_name,
                'phone': (bud_obj.phone if can_view_staff_phones else None),
            } if has_bud else None,
            'is_independent': is_ind,
            'duty_type': 'Independent duty' if is_ind else 'Supported duty',
            'next_shift': next_duty,
        }

    return {
        'duty_status': {
            'status': duty_status,
            'shift_name': current_shift_name,
            'window': shift_window,
            'location': shift_location,
            'progress_percent': progress_percent,
            'next_duty': next_duty,
        },
        'summary_tiles': {
            'hours_today': today_hours,
            'hours_week': week_hours,
            'hours_month': month_hours,
            'days_on_week': days_on_w,
            'days_off_week': days_off_w,
            'days_standby_week': days_sb_w,
            'days_on_month': days_on_m,
            'days_off_month': days_off_m,
            'days_standby_month': days_sb_m,
            'max_weekly_hours': max_weekly_hours,
            'weekly_hours_percent': weekly_hours_percent,
            'weekly_provisional_note': 'PROVISIONAL - HR sign-off needed',
        },
        'weekly_strip': weekly_strip,
        'week_total_hours': week_hours,
        'month_days': month_days,
        'today_duty': today_duty,
    }


def _classify_patient_vitals(latest_v, now=None):
    if not latest_v:
        return 'no_recent_vitals', ['No vitals recorded']

    if now is None:
        now = timezone.now()
    recent_window_hrs = getattr(settings, 'RECENT_VITALS_WINDOW_HOURS', 24)
    vitals_cutoff = now - datetime.timedelta(hours=recent_window_hrs)
    if latest_v.recorded_at < vitals_cutoff:
        return 'no_recent_vitals', [f'No vitals recorded within past {recent_window_hrs} hours']

    tier_thresholds = getattr(settings, 'CLINICAL_TIER_THRESHOLDS', {})
    crit_th = tier_thresholds.get('critical', {})
    less_th = tier_thresholds.get('less_critical', {})
    mild_th = tier_thresholds.get('mild', {})

    v_th = getattr(settings, 'VITALS_THRESHOLDS', {})
    sys_max = v_th.get('systolic_max', 140)
    sys_min = v_th.get('systolic_min', 90)
    dia_max = v_th.get('diastolic_max', 90)
    dia_min = v_th.get('diastolic_min', 60)
    hr_max = v_th.get('heart_rate_max', 100)
    hr_min = v_th.get('heart_rate_min', 50)
    spo2_min = v_th.get('spo2_min', 92)
    temp_max = v_th.get('temperature_max', 38.0)
    temp_min = v_th.get('temperature_min', 35.5)
    bg_max = v_th.get('blood_glucose_max', 180)
    bg_min = v_th.get('blood_glucose_min', 70)
    stable_sys_max = mild_th.get('systolic_min', 135) - 1

    sys = latest_v.blood_pressure_systolic
    dia = latest_v.blood_pressure_diastolic
    hr = latest_v.heart_rate
    spo2 = latest_v.spo2
    temp = float(latest_v.temperature) if latest_v.temperature else None
    bg = float(latest_v.blood_glucose) if latest_v.blood_glucose else None

    # 1. Critical Tier Check
    is_critical = (
        (spo2 is not None and spo2 <= crit_th.get('spo2_max', -1)) or
        (sys is not None and (sys >= crit_th.get('systolic_high', 999) or sys <= crit_th.get('systolic_low', -1))) or
        (hr is not None and (hr >= crit_th.get('heart_rate_high', 999) or hr <= crit_th.get('heart_rate_low', -1))) or
        (temp is not None and temp >= crit_th.get('temperature_high', 999.0))
    )
    if is_critical:
        return 'critical', []

    # 2. Less Critical Tier Check
    is_less_critical = (
        (spo2 is not None and less_th.get('spo2_min', 0) <= spo2 <= less_th.get('spo2_max', 0)) or
        (sys is not None and (
            (less_th.get('systolic_high_min', 999) <= sys <= less_th.get('systolic_high_max', 0)) or
            (less_th.get('systolic_low_min', 999) <= sys <= less_th.get('systolic_low_max', 0))
        )) or
        (hr is not None and (
            (less_th.get('heart_rate_high_min', 999) <= hr <= less_th.get('heart_rate_high_max', 0)) or
            (less_th.get('heart_rate_low_min', 999) <= hr <= less_th.get('heart_rate_low_max', 0))
        )) or
        (temp is not None and less_th.get('temperature_high_min', 999.0) <= temp <= less_th.get('temperature_high_max', 0.0))
    )
    if is_less_critical:
        return 'less_critical', []

    # 3. Mild Tier Check
    is_mild = (
        (sys is not None and mild_th.get('systolic_min', 999) <= sys <= mild_th.get('systolic_max', 0)) or
        (temp is not None and mild_th.get('temperature_min', 999.0) <= temp <= mild_th.get('temperature_max', 0.0))
    )
    if is_mild:
        return 'mild', []

    # 4. Unclassified Check (abnormal in baseline VITALS_THRESHOLDS but unbracketed in acute tiers)
    is_unclassified = (
        (sys is not None and (sys < sys_min or sys > stable_sys_max)) or
        (dia is not None and (dia < dia_min or dia > dia_max)) or
        (hr is not None and (hr < hr_min or hr > hr_max)) or
        (spo2 is not None and spo2 < spo2_min) or
        (temp is not None and (temp < temp_min or temp > temp_max)) or
        (bg is not None and (bg < bg_min or bg > bg_max))
    )
    if is_unclassified:
        reasons = []
        if dia is not None and (dia < dia_min or dia > dia_max):
            reasons.append(f"Diastolic BP {dia} mmHg outside normal ({dia_min}-{dia_max})")
        if bg is not None and (bg < bg_min or bg > bg_max):
            reasons.append(f"Blood glucose {bg} mg/dL outside normal ({bg_min}-{bg_max})")
        if temp is not None and temp < temp_min:
            reasons.append(f"Hypothermia: Temperature {temp}°C below normal ({temp_min}°C)")
        if not reasons:
            reasons.append("Vital signs outside baseline normal range - unclassified tier")
        return 'unclassified', reasons

    return 'stable', []


def _get_doctor_tier_groups(user, now=None):
    if now is None:
        now = timezone.now()
    from patients.scoping import get_assigned_patient_ids_for_clinician
    assigned_pids = get_assigned_patient_ids_for_clinician(user)
    pt_qs = Patient.objects.filter(is_active=True)
    if assigned_pids is not None:
        if getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False):
            from staff.pin_service import is_patient_unlocked_for_user
            assigned_pids = {pid for pid in assigned_pids if is_patient_unlocked_for_user(user, pid, now=now)[0]}
        pt_qs = pt_qs.filter(id__in=assigned_pids)

    groups = {
        'critical': [],
        'less_critical': [],
        'mild': [],
        'unclassified': [],
        'no_recent_vitals': [],
        'stable': [],
    }

    for pt in pt_qs:
        latest_v = VitalSign.objects.filter(patient=pt, is_entered_in_error=False).order_by('-recorded_at').first()
        tier, reasons = _classify_patient_vitals(latest_v, now)
        v_dict = {
            'patient_id': pt.id,
            'patient_name': pt.full_name,
            'patient_code': pt.patient_code or f"PT-{pt.id}",
            'mr_number': pt.mr_number,
            'diagnosis': pt.primary_diagnosis or 'Under clinical care',
            'last_recorded': latest_v.recorded_at.isoformat() if latest_v else None,
            'bp': f"{latest_v.blood_pressure_systolic}/{latest_v.blood_pressure_diastolic or '-'}" if (latest_v and latest_v.blood_pressure_systolic) else '-',
            'hr': latest_v.heart_rate if latest_v else None,
            'spo2': latest_v.spo2 if latest_v else None,
            'temp': float(latest_v.temperature) if (latest_v and latest_v.temperature) else None,
            'blood_glucose': float(latest_v.blood_glucose) if (latest_v and latest_v.blood_glucose) else None,
            'recorded_at': latest_v.recorded_at.isoformat() if latest_v else None,
        }
        if reasons:
            v_dict['unclassified_reasons'] = reasons
            v_dict['reason'] = reasons[0]
        groups[tier].append(v_dict)

    return groups


# ── 1b. GET /api/staff-portal/clinician-home/ ─────────────────────────────────

class ClinicianPortalHomeView(APIView):
    """
    Clinician Home API (for doctor, physiotherapist, speech_therapist, psychotherapist).
    Provides greeting, designation, specialities, working hours from settings,
    digital ID card, today's visits table, pending requests, high-alert patients
    grouped Critical/Less critical/Mild/Stable, quick links, and disabled placeholders.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        staff = _resolve_staff_member(request.user)
        user_role = get_user_role(request.user)

        client_platform = (
            request.headers.get('X-Client-Platform') or
            request.META.get('HTTP_X_CLIENT_PLATFORM') or
            request.query_params.get('platform') or
            'web'
        ).lower().strip()

        if staff:
            if staff.platform_allowed == 'mobile' and client_platform != 'mobile':
                return Response(
                    {
                        'error': 'mobile_only',
                        'detail': 'This account is configured for mobile app access only. Please log in using the HomeCare OS Mobile App.',
                        'platform_allowed': 'mobile',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            if staff.platform_allowed == 'web' and client_platform == 'mobile':
                return Response(
                    {
                        'error': 'web_only',
                        'detail': 'This account is configured for web access only. Please log in at the HomeCare OS web dashboard.',
                        'platform_allowed': 'web',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        now = timezone.now()
        tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
        try:
            local_tz = ZoneInfo(tz_name)
        except Exception:
            local_tz = timezone.get_current_timezone()

        local_now = now.astimezone(local_tz)

        # 1. Office hours from settings
        office_start_str = getattr(settings, 'OFFICE_HOURS_START', '09:00')
        office_end_str = getattr(settings, 'OFFICE_HOURS_END', '17:00')
        start_hour, start_min = map(int, office_start_str.split(':')[:2])
        end_hour, end_min = map(int, office_end_str.split(':')[:2])
        office_start_time = datetime.time(start_hour, start_min)
        office_end_time = datetime.time(end_hour, end_min)
        is_open_now = (office_start_time <= local_now.time() <= office_end_time)

        working_hours = {
            'start': office_start_str,
            'end': office_end_str,
            'timezone': tz_name,
            'is_open_now': is_open_now,
            'status_label': 'Open now' if is_open_now else f'Closed, opens {office_start_str} AM',
        }

        # 2. Clinician Profile / ID Card
        if staff:
            name = staff.full_name
            emp_id = staff.employee_id
            designation = staff.designation or staff.get_role_display()
            specialities = staff.specialization or ('Clinical Medicine & Surgery' if staff.role == 'doctor' else staff.get_role_display())
            contact = staff.phone or staff.email or 'N/A'
            photo_url = staff.photo.url if staff.photo else None
            role_key = staff.role
        else:
            name = request.user.get_full_name() or request.user.username
            emp_id = 'STAFF-ADMIN'
            designation = user_role.replace('_', ' ').title()
            specialities = 'General Clinical Practice'
            contact = request.user.email or 'N/A'
            photo_url = None
            role_key = user_role

        digital_id = {
            'name': name,
            'employee_id': emp_id,
            'designation': designation,
            'specialities': specialities,
            'contact': contact,
            'photo_url': photo_url,
            'employment_type': 'Full-time Clinical Staff',
        }

        # 3. Today's visits table
        start_of_day = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)

        b_qs = Booking.objects.select_related('patient', 'assigned_staff', 'buddy_staff', 'buddy').filter(
            scheduled_time__range=(start_of_day, end_of_day)
        ).exclude(status=BookingStatus.CANCELLED)

        if staff and user_role not in ('super_admin', 'admin', 'care_manager', 'branch_manager'):
            b_qs = b_qs.filter(
                Q(assigned_staff=staff) | Q(buddy=staff) | Q(buddy_staff=staff)
            )

        today_visits = []
        for b in b_qs.order_by('scheduled_time'):
            p = b.patient
            buddy_name = (b.buddy_staff.full_name if b.buddy_staff else (b.buddy.full_name if b.buddy else 'None'))
            cm_name = p.assigned_care_manager.full_name if p.assigned_care_manager else 'Care Coordinator'
            today_visits.append({
                'id': b.id,
                'patient_id': p.id,
                'patient_name': p.full_name,
                'patient_code': p.patient_code or f"PT-{p.id}",
                'mr_number': p.mr_number,
                'visit_time': b.scheduled_time.astimezone(local_tz).strftime('%H:%M'),
                'location': p.address or 'Islamabad, Pakistan',
                'visit_type': b.get_service_type_display() if hasattr(b, 'get_service_type_display') else b.service_type,
                'buddy_staff': buddy_name,
                'care_manager': cm_name,
                'status': b.status,
                'status_display': b.get_status_display() if hasattr(b, 'get_status_display') else b.status,
            })

        # 4. Pending Requests (referrals, consultation requests, procedure requests)
        sr_qs = StaffRequest.objects.filter(status='pending').select_related('patient', 'staff')
        if staff and user_role not in ('super_admin', 'admin', 'care_manager', 'branch_manager'):
            from patients.scoping import get_assigned_patient_ids_for_clinician
            assigned_ids = get_assigned_patient_ids_for_clinician(request.user)
            if assigned_ids is not None:
                sr_qs = sr_qs.filter(Q(patient_id__in=assigned_ids) | Q(staff=staff))

        pending_referrals = []
        pending_consultations = []
        pending_procedures = []
        for r in sr_qs.order_by('-created_at'):
            item = {
                'id': r.id,
                'patient_id': r.patient_id,
                'patient_name': r.patient.full_name if r.patient else 'Unknown',
                'patient_code': r.patient.patient_code if r.patient else '',
                'mr_number': r.patient.mr_number if r.patient else '',
                'urgency': r.urgency,
                'notes': r.notes,
                'created_at': r.created_at.isoformat(),
                'type': r.request_type,
            }
            if r.request_type == 'referral':
                pending_referrals.append(item)
            elif r.request_type == 'appointment':
                pending_consultations.append(item)
            elif r.request_type == 'procedure_change':
                pending_procedures.append(item)

        # For Doctor role: Prescriptions requiring clinical verification
        prescriptions_to_verify = []
        if user_role == 'doctor' or (staff and staff.role == 'doctor'):
            from patients.models import Prescription
            from patients.scoping import get_assigned_patient_ids_for_clinician
            assigned_doc_pids = get_assigned_patient_ids_for_clinician(request.user)
            rx_qs = Prescription.objects.filter(
                verification_status='pending_verification'
            ).select_related('patient', 'entered_by', 'uploaded_by')
            if assigned_doc_pids is not None:
                if getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False):
                    from staff.pin_service import is_patient_unlocked_for_user
                    assigned_doc_pids = [
                        pid for pid in assigned_doc_pids
                        if is_patient_unlocked_for_user(request.user, pid, now=now)[0]
                    ]
                rx_qs = rx_qs.filter(patient_id__in=assigned_doc_pids)

            for rx in rx_qs.order_by('-created_at'):
                entered_name = rx.entered_by.get_full_name() if rx.entered_by else (rx.uploaded_by.full_name if rx.uploaded_by else rx.prescribed_by)
                prescriptions_to_verify.append({
                    'id': rx.id,
                    'patient_id': rx.patient_id,
                    'patient_name': rx.patient.full_name if rx.patient else 'Unknown',
                    'patient_code': rx.patient.patient_code if rx.patient else '',
                    'mr_number': rx.patient.mr_number if rx.patient else '',
                    'medication': rx.medication,
                    'dosage': rx.dosage,
                    'frequency': rx.frequency,
                    'route': rx.route,
                    'duration_days': rx.duration_days,
                    'ordering_doctor_name': rx.ordering_doctor_name,
                    'entered_by': entered_name,
                    'order_source': rx.order_source,
                    'created_at': rx.created_at.isoformat(),
                    'type': 'prescription_verification',
                })

        pending_requests = {
            'total_pending': len(pending_referrals) + len(pending_consultations) + len(pending_procedures) + len(prescriptions_to_verify),
            'referrals': pending_referrals,
            'consultations': pending_consultations,
            'procedures': pending_procedures,
            'prescriptions_to_verify': prescriptions_to_verify,
            'prescriptions_to_verify_count': len(prescriptions_to_verify),
        }

        # 5. High-Alert Patients (Critical, Less critical, Mild, Unclassified, Stable)
        tier_thresholds = getattr(settings, 'CLINICAL_TIER_THRESHOLDS', {})
        crit_th = tier_thresholds.get('critical', {})
        less_th = tier_thresholds.get('less_critical', {})
        mild_th = tier_thresholds.get('mild', {})
        v_th = getattr(settings, 'VITALS_THRESHOLDS', {})
        sys_max = v_th.get('systolic_max', 140)
        sys_min = v_th.get('systolic_min', 90)
        dia_max = v_th.get('diastolic_max', 90)
        dia_min = v_th.get('diastolic_min', 60)
        hr_max = v_th.get('heart_rate_max', 100)
        hr_min = v_th.get('heart_rate_min', 50)
        spo2_min = v_th.get('spo2_min', 92)
        temp_max = v_th.get('temperature_max', 38.0)
        temp_min = v_th.get('temperature_min', 35.5)
        bg_max = v_th.get('blood_glucose_max', 180)
        bg_min = v_th.get('blood_glucose_min', 70)
        stable_sys_max = mild_th.get('systolic_min', 135) - 1
        recent_window_hrs = getattr(settings, 'RECENT_VITALS_WINDOW_HOURS', 24)

        high_alert_groups = _get_doctor_tier_groups(request.user, now=now)

        quick_links = [
            {'id': 'patients', 'label': 'Patient Records', 'page': 'patient-chart', 'icon': 'Folder'},
            {'id': 'pharmacy', 'label': 'Pharmacy', 'page': 'pharmacy', 'icon': 'Pill'},
            {'id': 'equipment', 'label': 'Equipment', 'page': 'equipment', 'icon': 'Truck'},
        ]

        placeholders = [
            {'id': 'online_consult', 'title': 'Online consultation (audio, video)', 'status': 'Coming soon', 'disabled': True},
            {'id': 'ai_assistant', 'title': 'AI Assistant', 'status': 'Coming soon', 'disabled': True},
        ]

        alert_thresholds_used = {
            'critical': (
                f"SpO2 <= {crit_th.get('spo2_max', 87)}% | "
                f"Systolic >= {crit_th.get('systolic_high', 181)} or <= {crit_th.get('systolic_low', 79)} | "
                f"HR >= {crit_th.get('heart_rate_high', 131)} or <= {crit_th.get('heart_rate_low', 39)} | "
                f"Temp >= {crit_th.get('temperature_high', 39.1)}°C"
            ),
            'less_critical': (
                f"SpO2 {less_th.get('spo2_min', 88)}-{less_th.get('spo2_max', 91)}% | "
                f"Systolic {less_th.get('systolic_high_min', 141)}-{less_th.get('systolic_high_max', 180)} or {less_th.get('systolic_low_min', 80)}-{less_th.get('systolic_low_max', 89)} | "
                f"HR {less_th.get('heart_rate_high_min', 101)}-{less_th.get('heart_rate_high_max', 130)} or {less_th.get('heart_rate_low_min', 40)}-{less_th.get('heart_rate_low_max', 49)} | "
                f"Temp {less_th.get('temperature_high_min', 38.5)}-{less_th.get('temperature_high_max', 39.0)}°C"
            ),
            'mild': (
                f"Systolic {mild_th.get('systolic_min', 135)}-{mild_th.get('systolic_max', 140)} (Mildly elevated) | "
                f"Temp {mild_th.get('temperature_min', 38.1)}-{mild_th.get('temperature_max', 38.4)}°C (Mildly elevated)"
            ),
            'unclassified': (
                f"Vital outside baseline normal (Diastolic {dia_min}-{dia_max}, Glucose {bg_min}-{bg_max}, "
                f"Hypothermia < {temp_min}°C, or unbracketed range) - Needs review"
            ),
            'no_recent_vitals': f"No vitals recorded within recent window ({recent_window_hrs} hours)",
            'stable': (
                f"All vitals within normal target limits: SpO2 >= {spo2_min}%, "
                f"Systolic {sys_min}-{stable_sys_max}, Diastolic {dia_min}-{dia_max}, "
                f"HR {hr_min}-{hr_max}, Temp {temp_min}-{temp_max}°C, Glucose {bg_min}-{bg_max}"
            ),
        }

        # 6. Consultation counts (role doctor only)
        consultation_counts = None
        is_doctor = (user_role == 'doctor' or (staff and staff.role == 'doctor'))
        if is_doctor:
            doctor_service_types = [
                ServiceType.DOCTOR_CONSULTATION,
                ServiceType.DOCTORS,
                'doctor_consultation',
                'doctors',
            ]
            if staff:
                doc_bookings = Booking.objects.filter(
                    assigned_staff=staff,
                    service_type__in=doctor_service_types,
                ).exclude(status=BookingStatus.CANCELLED)
            else:
                doc_bookings = Booking.objects.none()

            physical_qs = doc_bookings.exclude(service_mode=ServiceMode.ONLINE)

            today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
            today_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)

            days_since_monday = local_now.weekday()
            week_start = (local_now - datetime.timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
            week_end = (week_start + datetime.timedelta(days=6)).replace(hour=23, minute=59, second=59, microsecond=999999)

            import calendar
            _, last_day = calendar.monthrange(local_now.year, local_now.month)
            month_start = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month_end = local_now.replace(day=last_day, hour=23, minute=59, second=59, microsecond=999999)

            scheduled_statuses = [
                BookingStatus.ASSIGNED,
                BookingStatus.IN_PROGRESS,
                BookingStatus.EN_ROUTE,
                BookingStatus.PENDING,
                'confirmed',
                'assigned',
                'in_progress',
            ]

            physical_counts = {
                'today': physical_qs.filter(scheduled_time__range=(today_start, today_end)).count(),
                'this_week': physical_qs.filter(scheduled_time__range=(week_start, week_end)).count(),
                'this_month': physical_qs.filter(scheduled_time__range=(month_start, month_end)).count(),
                'total': physical_qs.count(),
                'completed': physical_qs.filter(status=BookingStatus.COMPLETED).count(),
                'scheduled': physical_qs.filter(status__in=scheduled_statuses).exclude(status=BookingStatus.COMPLETED).count(),
            }

            video_counts = {
                'today': 0,
                'this_week': 0,
                'this_month': 0,
                'total': 0,
                'completed': 0,
                'scheduled': 0,
                'available': False,
            }

            consultation_counts = {
                'physical': physical_counts,
                'video': video_counts,
            }

        # 7. Employment Status Block & Roster Summary Block
        employment_status_block = None
        if staff:
            employment_status_block = {
                'status': staff.employment_status or '',
                'status_display': staff.get_employment_status_display() if staff.employment_status else '',
                'probation_end_date': staff.probation_end_date.isoformat() if staff.probation_end_date else None,
            }

        roster_summary_block = compute_roster_summary(staff, local_now, local_tz, user=request.user)

        resp_data = {
            'staff': digital_id,
            'working_hours': working_hours,
            'employment_status': employment_status_block,
            'roster_summary': roster_summary_block,
            'today_visits': today_visits,
            'pending_requests': pending_requests,
            'high_alert_patients': high_alert_groups,
            'alert_thresholds_used': alert_thresholds_used,
            'provisional_note': 'PROVISIONAL - needs clinical sign-off',
            'quick_links': quick_links,
            'placeholders': placeholders,
        }
        if is_doctor and consultation_counts is not None:
            resp_data['consultation_counts'] = consultation_counts

        return Response(resp_data)


# ── Drawer Scoped List Endpoints for Doctor Portal ────────────────────────────

class DoctorConsultationsListView(APIView):
    """
    Drawer endpoint returning physical consultations for the logged-in doctor.
    Supports ?filter=today|this_week|this_month|completed|scheduled|total.
    Role must be doctor. Non-doctor gets 403. Unassigned clinician or unassigned patient gets 403/404.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user_role = get_user_role(request.user)
        staff = _resolve_staff_member(request.user)
        is_doctor = (user_role == 'doctor' or (staff and staff.role == 'doctor'))
        if not is_doctor:
            return Response({'detail': 'Doctor privileges required.'}, status=status.HTTP_403_FORBIDDEN)

        from patients.scoping import get_assigned_patient_ids_for_clinician, check_clinician_patient_access
        assigned_pids = get_assigned_patient_ids_for_clinician(request.user)
        patient_id = request.query_params.get('patient_id')
        if patient_id:
            check_clinician_patient_access(request.user, patient_id)
        elif not assigned_pids:
            return Response({'detail': 'No assigned patients found.'}, status=status.HTTP_404_NOT_FOUND)

        filter_param = request.query_params.get('filter', 'today').lower().strip()
        doctor_service_types = [
            ServiceType.DOCTOR_CONSULTATION,
            ServiceType.DOCTORS,
            'doctor_consultation',
            'doctors',
        ]
        qs = Booking.objects.filter(
            assigned_staff=staff,
            service_type__in=doctor_service_types,
        ).exclude(status=BookingStatus.CANCELLED).exclude(service_mode=ServiceMode.ONLINE)

        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        elif assigned_pids is not None:
            qs = qs.filter(patient_id__in=assigned_pids)

        now = timezone.now()
        tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
        try:
            local_tz = ZoneInfo(tz_name)
        except Exception:
            local_tz = timezone.get_current_timezone()
        local_now = now.astimezone(local_tz)

        today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
        days_since_monday = local_now.weekday()
        week_start = (local_now - datetime.timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = (week_start + datetime.timedelta(days=6)).replace(hour=23, minute=59, second=59, microsecond=999999)
        import calendar
        _, last_day = calendar.monthrange(local_now.year, local_now.month)
        month_start = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = local_now.replace(day=last_day, hour=23, minute=59, second=59, microsecond=999999)

        scheduled_statuses = [
            BookingStatus.ASSIGNED,
            BookingStatus.IN_PROGRESS,
            BookingStatus.EN_ROUTE,
            BookingStatus.PENDING,
            'confirmed',
            'assigned',
            'in_progress',
        ]

        if filter_param == 'today':
            qs = qs.filter(scheduled_time__range=(today_start, today_end))
        elif filter_param == 'this_week':
            qs = qs.filter(scheduled_time__range=(week_start, week_end))
        elif filter_param == 'this_month':
            qs = qs.filter(scheduled_time__range=(month_start, month_end))
        elif filter_param == 'completed':
            qs = qs.filter(status=BookingStatus.COMPLETED)
        elif filter_param == 'scheduled':
            qs = qs.filter(status__in=scheduled_statuses).exclude(status=BookingStatus.COMPLETED)
        # 'total' leaves qs as all physical_qs

        bookings = qs.select_related('patient').order_by('-scheduled_time')
        results = []
        from staff.pin_service import is_patient_unlocked_for_user
        for b in bookings:
            p = b.patient
            is_unlocked, _ = is_patient_unlocked_for_user(request.user, p.id, now=now) if p else (True, None)
            is_file_locked = not is_unlocked
            results.append({
                'id': b.id,
                'patient_id': p.id if p else None,
                'patient_name': p.full_name if p else '',
                'patient_code': p.patient_code if p else f"PT-{b.patient_id}",
                'mr_number': p.mr_number if p else '',
                'age': p.age if (p and is_unlocked) else None,
                'gender': (p.get_gender_display() if (p and hasattr(p, 'get_gender_display')) else (p.gender if p else '')) if is_unlocked else '',
                'diagnosis': (b.diagnosis or (p.primary_diagnosis if p else '')) if is_unlocked else 'Locked — Enter Duty PIN',
                'location': b.address or (p.address if p else ''),
                'scheduled_time': b.scheduled_time.isoformat() if b.scheduled_time else None,
                'status': b.status,
                'service_type': b.service_type,
                'is_file_locked': is_file_locked,
            })

        return Response({
            'filter': filter_param,
            'count': len(results),
            'results': results,
        })


class DoctorPendingRequestsListView(APIView):
    """
    Drawer endpoint returning pending clinical requests (referrals, consultations, procedures, prescriptions_to_verify)
    for the logged-in doctor.
    Supports ?type=referrals|consultations|procedures|prescriptions_to_verify|all.
    Role must be doctor. Non-doctor gets 403. Unassigned clinician or unassigned patient gets 403/404.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user_role = get_user_role(request.user)
        staff = _resolve_staff_member(request.user)
        is_doctor = (user_role == 'doctor' or (staff and staff.role == 'doctor'))
        if not is_doctor:
            return Response({'detail': 'Doctor privileges required.'}, status=status.HTTP_403_FORBIDDEN)

        from patients.scoping import get_assigned_patient_ids_for_clinician, check_clinician_patient_access
        assigned_pids = get_assigned_patient_ids_for_clinician(request.user)
        patient_id = request.query_params.get('patient_id')
        if patient_id:
            check_clinician_patient_access(request.user, patient_id)
        elif not assigned_pids:
            return Response({'detail': 'No assigned patients found.'}, status=status.HTTP_404_NOT_FOUND)

        req_type = request.query_params.get('type', 'all').lower().strip()

        # Fetch StaffRequests
        sr_qs = StaffRequest.objects.filter(status='pending').select_related('patient', 'staff')
        if patient_id:
            sr_qs = sr_qs.filter(patient_id=patient_id)
        elif assigned_pids is not None:
            sr_qs = sr_qs.filter(Q(patient_id__in=assigned_pids) | Q(staff=staff))

        pending_referrals = []
        pending_consultations = []
        pending_procedures = []
        from staff.pin_service import is_patient_unlocked_for_user
        for r in sr_qs.order_by('-created_at'):
            is_unlocked, _ = is_patient_unlocked_for_user(request.user, r.patient_id) if r.patient_id else (True, None)
            item = {
                'id': r.id,
                'patient_id': r.patient_id,
                'patient_name': r.patient.full_name if r.patient else 'Unknown',
                'patient_code': r.patient.patient_code if r.patient else '',
                'mr_number': r.patient.mr_number if r.patient else '',
                'urgency': r.urgency,
                'notes': r.notes if is_unlocked else 'Locked — Enter Duty PIN',
                'is_file_locked': not is_unlocked,
                'created_at': r.created_at.isoformat(),
                'type': r.request_type,
            }
            if r.request_type == 'referral':
                pending_referrals.append(item)
            elif r.request_type == 'appointment':
                pending_consultations.append(item)
            elif r.request_type == 'procedure_change':
                pending_procedures.append(item)

        # Fetch Prescriptions to verify
        prescriptions_to_verify = []
        from patients.models import Prescription
        rx_qs = Prescription.objects.filter(
            verification_status='pending_verification'
        ).select_related('patient', 'entered_by', 'uploaded_by')
        if patient_id:
            rx_qs = rx_qs.filter(patient_id=patient_id)
        elif assigned_pids is not None:
            if getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False):
                assigned_pids = [pid for pid in assigned_pids if is_patient_unlocked_for_user(request.user, pid)[0]]
            rx_qs = rx_qs.filter(patient_id__in=assigned_pids)

        for rx in rx_qs.order_by('-created_at'):
            entered_name = rx.entered_by.get_full_name() if rx.entered_by else (rx.uploaded_by.full_name if rx.uploaded_by else rx.prescribed_by)
            prescriptions_to_verify.append({
                'id': rx.id,
                'patient_id': rx.patient_id,
                'patient_name': rx.patient.full_name if rx.patient else 'Unknown',
                'patient_code': rx.patient.patient_code if rx.patient else '',
                'mr_number': rx.patient.mr_number if rx.patient else '',
                'medication': rx.medication,
                'dosage': rx.dosage,
                'frequency': rx.frequency,
                'route': rx.route,
                'duration_days': rx.duration_days,
                'ordering_doctor_name': rx.ordering_doctor_name,
                'entered_by': entered_name,
                'order_source': rx.order_source,
                'created_at': rx.created_at.isoformat(),
                'type': 'prescription_verification',
            })

        if req_type == 'referrals':
            results = pending_referrals
        elif req_type == 'consultations':
            results = pending_consultations
        elif req_type == 'procedures':
            results = pending_procedures
        elif req_type == 'prescriptions_to_verify':
            results = prescriptions_to_verify
        else:
            results = pending_referrals + pending_consultations + pending_procedures + prescriptions_to_verify

        return Response({
            'type': req_type,
            'count': len(results),
            'results': results,
        })


class DoctorPatientsByTierListView(APIView):
    """
    Drawer endpoint returning patients assigned to the doctor filtered by acute clinical tier:
    critical, less_critical, mild, unclassified, stable.
    Role must be doctor. Non-doctor gets 403. Unassigned clinician or unassigned patient gets 403/404.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user_role = get_user_role(request.user)
        staff = _resolve_staff_member(request.user)
        is_doctor = (user_role == 'doctor' or (staff and staff.role == 'doctor'))
        if not is_doctor:
            return Response({'detail': 'Doctor privileges required.'}, status=status.HTTP_403_FORBIDDEN)

        from patients.scoping import get_assigned_patient_ids_for_clinician, check_clinician_patient_access
        assigned_pids = get_assigned_patient_ids_for_clinician(request.user)
        patient_id = request.query_params.get('patient_id')
        if patient_id:
            check_clinician_patient_access(request.user, patient_id)
        elif not assigned_pids:
            return Response({'detail': 'No assigned patients found.'}, status=status.HTTP_404_NOT_FOUND)

        tier = request.query_params.get('tier', 'critical').lower().strip()
        groups = _get_doctor_tier_groups(request.user)
        results = groups.get(tier, [])

        if patient_id:
            pid_int = int(patient_id)
            results = [r for r in results if r['patient_id'] == pid_int]

        return Response({
            'tier': tier,
            'count': len(results),
            'results': results,
        })


class NurseTodayWorkListView(APIView):
    """
    Drawer endpoint returning items for the nurse's 'Today's Work' numbers:
    - patients_today: assigned patients with an active or scheduled visit today
    - vitals_overdue: patients with active visits whose latest non-error vitals are older than NURSE_VITALS_DUE_HOURS
    - active_medications: active verified medications across assigned patients
    - pending_verification: nurse's own transcribed prescriptions awaiting verification
    - pending_notes: patients with active shift > 2h without a nurse note
    - alerts: active alerts for the nurse's patients
    Role must be nurse (field nurse). Non-nurses get 403 Forbidden.
    Scoped strictly to assigned patients.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user_role = get_user_role(request.user)
        staff = _resolve_staff_member(request.user)
        is_nurse = (user_role == 'nurse' or (staff and staff.role == 'nurse'))
        if not is_nurse:
            return Response({'detail': 'Nurse privileges required.'}, status=status.HTTP_403_FORBIDDEN)

        from patients.scoping import get_assigned_patient_ids_for_clinician
        assigned_pids = get_assigned_patient_ids_for_clinician(request.user)
        if not assigned_pids:
            return Response({'detail': 'No assigned patients found.'}, status=status.HTTP_404_NOT_FOUND)

        if getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False):
            from staff.pin_service import is_patient_unlocked_for_user
            assigned_pids = [
                pid for pid in assigned_pids
                if is_patient_unlocked_for_user(request.user, pid)[0]
            ]

        type_param = request.query_params.get('type', 'patients_today').lower().strip()
        now = timezone.now()
        tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
        try:
            local_tz = ZoneInfo(tz_name)
        except Exception:
            local_tz = timezone.get_current_timezone()
        local_now = now.astimezone(local_tz)

        today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
        vitals_due_hours = getattr(settings, 'NURSE_VITALS_DUE_HOURS', 4)

        results = []

        if type_param == 'patients_today':
            bookings = Booking.objects.filter(
                Q(assigned_staff=staff) | Q(buddy=staff) | Q(buddy_staff=staff),
                patient_id__in=assigned_pids,
                scheduled_time__range=[today_start, today_end],
            ).exclude(status=BookingStatus.CANCELLED).select_related('patient')

            seen = set()
            for b in bookings:
                p = b.patient
                if p.id not in seen:
                    seen.add(p.id)
                    latest_v = VitalSign.objects.filter(patient=p, is_entered_in_error=False).order_by('-recorded_at').first()
                    tier_res = _classify_patient_vitals(latest_v, now)
                    t_name = tier_res[0] if isinstance(tier_res, (tuple, list)) else tier_res
                    if t_name in ('no_recent_vitals', None, ''):
                        t_name = 'unclassified'
                    results.append({
                        'patient_id': p.id,
                        'name': p.full_name,
                        'mr_number': p.mr_number,
                        'age': p.age,
                        'gender': p.gender,
                        'gender_display': p.get_gender_display(),
                        'primary_diagnosis': p.primary_diagnosis or '-',
                        'allergy_status': getattr(p, 'allergy_status', 'not_recorded'),
                        'allergy_status_display': p.get_allergy_status_display() if hasattr(p, 'get_allergy_status_display') else 'Allergies not recorded',
                        'allergies': p.allergies or '',
                        'latest_tier': t_name,
                        'booking_id': b.id,
                        'scheduled_time': b.scheduled_time.isoformat() if b.scheduled_time else None,
                        'service_type': b.get_service_type_display() if hasattr(b, 'get_service_type_display') else b.service_type,
                    })

        elif type_param == 'vitals_overdue':
            # Patients with active or scheduled visit today
            patient_ids_today = set(Booking.objects.filter(
                Q(assigned_staff=staff) | Q(buddy=staff) | Q(buddy_staff=staff),
                patient_id__in=assigned_pids,
                scheduled_time__range=[today_start, today_end],
            ).exclude(status=BookingStatus.CANCELLED).values_list('patient_id', flat=True))

            for pid in patient_ids_today:
                p = Patient.objects.filter(id=pid).first()
                if not p:
                    continue
                latest_v = VitalSign.objects.filter(patient=p, is_entered_in_error=False).order_by('-recorded_at').first()
                is_overdue = False
                if not latest_v:
                    is_overdue = True
                else:
                    elapsed = (now - latest_v.recorded_at).total_seconds() / 3600.0
                    if elapsed >= vitals_due_hours:
                        is_overdue = True

                if is_overdue:
                    tier_res = _classify_patient_vitals(latest_v, now)
                    t_name = tier_res[0] if isinstance(tier_res, (tuple, list)) else tier_res
                    if t_name in ('no_recent_vitals', None, ''):
                        t_name = 'unclassified'
                    results.append({
                        'patient_id': p.id,
                        'patient_name': p.full_name,
                        'mr_number': p.mr_number,
                        'last_recorded_at': latest_v.recorded_at.isoformat() if latest_v else None,
                        'hours_overdue': round((now - latest_v.recorded_at).total_seconds() / 3600.0, 1) if latest_v else None,
                        'latest_tier': t_name,
                    })

        elif type_param == 'active_medications':
            rxs = Prescription.objects.filter(
                patient_id__in=assigned_pids,
                verification_status='verified',
            ).select_related('patient').order_by('patient__last_name', 'medication')

            for rx in rxs:
                last_admin = MARAdministration.objects.filter(
                    prescription=rx,
                    is_entered_in_error=False,
                ).order_by('-administered_at').first()

                results.append({
                    'id': rx.id,
                    'patient_id': rx.patient.id,
                    'patient_name': rx.patient.full_name,
                    'mr_number': rx.patient.mr_number,
                    'medication': rx.medication,
                    'dosage': rx.dosage,
                    'route': rx.route,
                    'frequency': rx.frequency,
                    'last_administered_at': last_admin.administered_at.isoformat() if last_admin else None,
                    'status': rx.verification_status,
                })

        elif type_param == 'pending_verification':
            pending_rxs = Prescription.objects.filter(
                prescribed_by=staff,
                verification_status='pending_verification',
            ).select_related('patient').order_by('-date')

            for rx in pending_rxs:
                results.append({
                    'id': rx.id,
                    'patient_id': rx.patient.id,
                    'patient_name': rx.patient.full_name,
                    'mr_number': rx.patient.mr_number,
                    'medication': rx.medication,
                    'dosage': rx.dosage,
                    'route': rx.route,
                    'frequency': rx.frequency,
                    'date': rx.date.isoformat() if hasattr(rx.date, 'isoformat') else str(rx.date),
                    'verification_status': rx.verification_status,
                })

        elif type_param == 'pending_notes':
            timeout_hours = getattr(settings, 'SHIFT_NOTE_TIMEOUT_HOURS', 2)
            active_bks = Booking.objects.filter(
                Q(assigned_staff=staff) | Q(buddy=staff) | Q(buddy_staff=staff),
                patient_id__in=assigned_pids,
                scheduled_time__lte=now - datetime.timedelta(hours=timeout_hours),
                status__in=[BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS, BookingStatus.EN_ROUTE],
            ).exclude(status=BookingStatus.CANCELLED).select_related('patient')

            seen = set()
            for b in active_bks:
                if b.patient_id in seen:
                    continue
                has_note = b.patient.nurse_notes.filter(
                    recorded_by=staff,
                    recorded_at__gte=b.scheduled_time
                ).exists()
                if not has_note:
                    seen.add(b.patient_id)
                    results.append({
                        'patient_id': b.patient.id,
                        'patient_name': b.patient.full_name,
                        'mr_number': b.patient.mr_number,
                        'shift_started_at': b.scheduled_time.isoformat(),
                        'hours_elapsed': round((now - b.scheduled_time).total_seconds() / 3600.0, 1),
                        'booking_id': b.id,
                    })

        elif type_param == 'alerts':
            alerts_raw = []
            for pid in assigned_pids:
                p = Patient.objects.filter(id=pid).first()
                if not p:
                    continue
                latest_v = VitalSign.objects.filter(patient=p, is_entered_in_error=False).order_by('-recorded_at').first()
                has_booking_today = Booking.objects.filter(
                    staff_booking_q(staff),
                    patient=p,
                    scheduled_time__range=[today_start, today_end],
                ).exclude(status=BookingStatus.CANCELLED).exists()
                if has_booking_today and (not latest_v or (now - latest_v.recorded_at).total_seconds() / 3600.0 >= vitals_due_hours):
                    alerts_raw.append({
                        'id': f"vitals-overdue-{p.id}",
                        'type': 'vitals_overdue',
                        'severity': 'high',
                        'title': f"Vitals Overdue for {p.full_name}",
                        'patient_id': p.id,
                        'source_record': f"patient_{p.id}",
                        'created_at': now.isoformat(),
                    })
                if latest_v and _classify_patient_vitals(latest_v, now) == 'critical':
                    alerts_raw.append({
                        'id': f"critical-vitals-{latest_v.id}",
                        'type': 'critical_vitals',
                        'severity': 'high',
                        'title': f"Critical Vitals Alert for {p.full_name}",
                        'patient_id': p.id,
                        'source_record': f"vital_{latest_v.id}",
                        'created_at': latest_v.recorded_at.isoformat(),
                    })
            for rx in Prescription.objects.filter(
                prescribed_by=staff,
                verified_at__gte=now - datetime.timedelta(hours=24),
                verification_status__in=['verified', 'rejected']
            ).select_related('patient'):
                alerts_raw.append({
                    'id': f"rx-verif-{rx.id}",
                    'type': f'order_{rx.verification_status}',
                    'severity': 'medium' if rx.verification_status == 'verified' else 'high',
                    'title': f"Order for {rx.medication} ({rx.patient.full_name}) was {rx.verification_status}",
                    'patient_id': rx.patient.id,
                    'source_record': f"rx_{rx.id}",
                    'created_at': rx.verified_at.isoformat() if rx.verified_at else now.isoformat(),
                })
            # Deduplicate alerts
            seen_keys = set()
            for a in alerts_raw:
                k = (a.get('type'), a.get('patient_id'), a.get('source_record'))
                if k not in seen_keys:
                    seen_keys.add(k)
                    results.append(a)

        return Response({
            'type': type_param,
            'count': len(results),
            'results': results,
        })


class ShiftHandoverNoteListView(APIView):
    """
    List and create shift handover notes.
    Write: Nurse only (assigned patient). Audited without note text.
    Read: Assigned nurses, treating doctor, care manager, admin, super_admin.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        role = get_user_role(user)
        is_admin_or_cm = (role in ('super_admin', 'admin', 'care_manager')) or getattr(user, 'is_superuser', False)

        patient_id = request.query_params.get('patient_id')
        from patients.scoping import get_assigned_patient_ids_for_clinician, check_clinician_patient_access

        if patient_id:
            if not is_admin_or_cm:
                check_clinician_patient_access(user, patient_id)
            pids = [int(patient_id)]
        else:
            if is_admin_or_cm:
                pids = None
            else:
                pids = get_assigned_patient_ids_for_clinician(user)
                if not pids:
                    return Response([], status=status.HTTP_200_OK)

        now = timezone.now()
        qs = ShiftHandoverNote.objects.filter(is_entered_in_error=False)
        if request.query_params.get('all') != 'true':
            qs = qs.filter(created_at__gte=now - datetime.timedelta(hours=24))

        if pids is not None:
            if not is_admin_or_cm and getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False):
                from staff.pin_service import is_patient_unlocked_for_user
                pids = [pid for pid in pids if is_patient_unlocked_for_user(user, pid, now=now)[0]]
            qs = qs.filter(patient_id__in=pids)

        qs = qs.select_related('patient', 'author').order_by('-created_at')
        serializer = ShiftHandoverNoteSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        user = request.user
        role = get_user_role(user)
        staff = _resolve_staff_member(user)

        is_nurse = (role == 'nurse' or (staff and staff.role == 'nurse'))
        if not is_nurse:
            return Response(
                {'detail': 'Only assigned nurses may author shift handover notes.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if staff and getattr(staff, 'lifecycle_stage', None) == 'trainee':
            return Response(
                {'detail': 'Staff member in Trainee stage cannot author shift handover notes.'},
                status=status.HTTP_403_FORBIDDEN
            )

        patient_id = request.data.get('patient_id') or request.data.get('patient')
        if not patient_id:
            return Response({'detail': 'patient_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        patient = Patient.objects.filter(id=patient_id, is_active=True).first()
        if not patient:
            return Response({'detail': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

        from patients.scoping import get_assigned_patient_ids_for_clinician
        assigned_pids = get_assigned_patient_ids_for_clinician(user)
        if assigned_pids is not None and patient.id not in assigned_pids:
            return Response(
                {'detail': 'Nurse is not assigned to this patient.'},
                status=status.HTTP_403_FORBIDDEN
            )

        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'detail': 'Handover text is required.'}, status=status.HTTP_400_BAD_REQUEST)

        shift_label = (request.data.get('shift_label') or '').strip()
        shift_date_str = request.data.get('shift_date')
        if shift_date_str:
            try:
                shift_date = datetime.date.fromisoformat(shift_date_str)
            except ValueError:
                shift_date = timezone.now().date()
        else:
            shift_date = timezone.now().date()

        handover = ShiftHandoverNote.objects.create(
            patient=patient,
            author=user,
            shift_label=shift_label,
            shift_date=shift_date,
            text=text,
        )

        actor_name = user.get_full_name() or user.username
        AuditLog.objects.create(
            actor=user,
            actor_name=actor_name,
            action="Shift Handover Note Created",
            target_user=f"Patient {patient.patient_code or patient.id}",
            details=f"Nurse ID {user.id} created handover note for Patient ID {patient.id}",
            timestamp=timezone.now()
        )

        serializer = ShiftHandoverNoteSerializer(handover, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ShiftHandoverNoteDetailView(APIView):
    """
    Retrieve, edit (within 15-minute window), or block physical delete of ShiftHandoverNote.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk):
        return get_object_or_404(ShiftHandoverNote, pk=pk)

    def patch(self, request, pk):
        note = self.get_object(pk)
        user = request.user
        from patients.scoping import check_nurse_patient_access
        check_nurse_patient_access(user, note.patient_id)

        if note.author_id != user.id:
            return Response({'detail': 'Only the author nurse may edit this handover note.'}, status=status.HTTP_403_FORBIDDEN)

        if note.is_entered_in_error:
            return Response({'detail': 'Cannot edit a record marked as entered in error.'}, status=status.HTTP_400_BAD_REQUEST)

        if not note.is_within_edit_window():
            window = getattr(settings, 'CLINICAL_RECORD_EDIT_WINDOW_MINUTES', 15)
            return Response(
                {'detail': f"Author edit window of {window} minutes has expired."},
                status=status.HTTP_400_BAD_REQUEST
            )

        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'detail': 'Handover text cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        note.text = text
        if request.data.get('shift_label'):
            note.shift_label = request.data.get('shift_label').strip()
        note.save(update_fields=['text', 'shift_label', 'updated_at'])

        AuditLog.objects.create(
            actor=user,
            actor_name=user.get_full_name() or user.username,
            action="Shift Handover Note Edited",
            target_user=f"Patient {note.patient.patient_code or note.patient.id}",
            details=f"Nurse ID {user.id} edited handover note ID {note.id}",
            timestamp=timezone.now()
        )

        serializer = ShiftHandoverNoteSerializer(note, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        return Response(
            {'detail': 'Physical deletion of clinical handover notes is prohibited. Mark as entered in error instead.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )


class ShiftHandoverNoteMarkErrorView(APIView):
    """
    Mark ShiftHandoverNote entered in error.
    Author (within 15m) or treating doctor at any time. Reason is required.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        note = get_object_or_404(ShiftHandoverNote, pk=pk)
        from patients.scoping import check_clinician_patient_access
        check_clinician_patient_access(request.user, note.patient)
        return handle_mark_entered_in_error(request, note.patient, note, 'handover')



# ── 2. GET /api/staff-portal/roster/ ───────────────────────────────────────────

class StaffPortalRosterView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response({'detail': 'Staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        view_mode = request.query_params.get('view', 'weekly')  # daily, weekly, monthly
        date_str = request.query_params.get('date')

        if date_str:
            try:
                base_date = datetime.date.fromisoformat(date_str)
            except ValueError:
                return Response({'detail': 'Invalid date format. Expected YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            base_date = timezone.now().date()

        if view_mode == 'daily':
            start_date = base_date
            end_date = base_date
        elif view_mode == 'monthly':
            start_date = base_date.replace(day=1)
            # End of month
            next_month = (start_date.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
            end_date = next_month - datetime.timedelta(days=1)
        else:  # weekly
            # Start on Monday of current week
            start_date = base_date - datetime.timedelta(days=base_date.weekday())
            end_date = start_date + datetime.timedelta(days=6)

        if getattr(staff, 'lifecycle_stage', None) == 'trainee':
            return Response({
                'view': view_mode,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'shifts': [],
                'duties': [],
                'count': 0,
            })

        start_dt = timezone.make_aware(datetime.datetime.combine(start_date, datetime.time.min))
        end_dt = timezone.make_aware(datetime.datetime.combine(end_date, datetime.time.max))

        bookings = (
            Booking.objects.filter(
                Q(assigned_staff=staff) | Q(buddy=staff),
                scheduled_time__range=[start_dt, end_dt],
            )
            .select_related('patient', 'supervisor', 'buddy')
            .order_by('scheduled_time')
        )

        shifts = []
        for b in bookings:
            start_time = b.scheduled_time
            if b.shift_end_time:
                end_time = b.shift_end_time
            else:
                hrs = 12 if '12' in b.shift_duration else (8 if '8' in b.shift_duration else 4)
                end_time = start_time + datetime.timedelta(hours=hrs)

            p = b.patient
            driver_name = getattr(b, 'transport_driver_name', '') or b.driver_name or getattr(staff, 'transport_driver_name', '') or ''
            driver_phone = getattr(b, 'transport_driver_phone', '') or b.driver_phone or getattr(staff, 'transport_driver_phone', '') or ''
            raw_pt = getattr(b, 'transport_pickup_time', '') or (b.pickup_time.strftime('%I:%M %p') if b.pickup_time else '') or getattr(staff, 'transport_pickup_time', '') or ''
            pickup_time = raw_pt if (raw_pt and str(raw_pt).strip()) else None
            buddy_obj = getattr(b, 'buddy_staff', None) or b.buddy or getattr(staff, 'buddy_staff', None)
            shifts.append({
                'id': b.id,
                'booking_id': b.id,
                'start': start_time.isoformat(),
                'end': end_time.isoformat(),
                'type': _derive_shift_label(start_time, end_time, tz=ZoneInfo(getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi'))),
                'status': b.status,
                'patient': {
                    'id': p.id,
                    'name': p.full_name,
                    'diagnosis': p.primary_diagnosis or b.diagnosis,
                    'location': p.address or b.address,
                    'patient_code': p.patient_code or f"PT-{p.id}",
                },
                'supervisor': {
                    'name': b.supervisor.full_name,
                    'phone': b.supervisor.phone,
                } if b.supervisor else None,
                'transport': {
                    'driver_name': driver_name or 'Staff Transport Van',
                    'driver_phone': driver_phone,
                    'pickup_time': pickup_time,
                } if (driver_name or pickup_time) else None,
                'buddy': {
                    'name': buddy_obj.full_name,
                    'phone': buddy_obj.phone,
                } if buddy_obj and buddy_obj.id != staff.id else None,
            })

        # Query published roster assignments for this staff member (staff only see published rosters)
        published_roster = RosterAssignment.objects.filter(
            staff=staff,
            date__range=[start_date, end_date],
            is_published=True,
        ).select_related('buddy_staff')

        local_tz = ZoneInfo(getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi'))

        for assign in published_roster:
            # If off-duty assignment, indicate off duty
            if assign.is_off:
                day_start = timezone.make_aware(datetime.datetime.combine(assign.date, datetime.time.min), timezone=local_tz)
                day_end = timezone.make_aware(datetime.datetime.combine(assign.date, datetime.time.max), timezone=local_tz)
                shifts.append({
                    'id': f"roster_{assign.id}",
                    'assignment_id': assign.id,
                    'start': day_start.isoformat(),
                    'end': day_end.isoformat(),
                    'type': 'Off Duty',
                    'status': 'off_duty',
                    'is_off': True,
                    'patient': {
                        'id': None,
                        'name': 'Scheduled Rest Day',
                        'diagnosis': 'Off Duty',
                        'location': 'Off Duty',
                        'patient_code': 'OFF',
                    },
                    'supervisor': None,
                    'transport': None,
                    'buddy': None,
                })
                continue

            st_time = assign.start_time or datetime.time(8, 0)
            en_time = assign.end_time or datetime.time(16, 0)
            try:
                shift_start = timezone.make_aware(datetime.datetime.combine(assign.date, st_time), timezone=local_tz)
                if en_time <= st_time:
                    shift_end = timezone.make_aware(datetime.datetime.combine(assign.date + datetime.timedelta(days=1), en_time), timezone=local_tz)
                else:
                    shift_end = timezone.make_aware(datetime.datetime.combine(assign.date, en_time), timezone=local_tz)
            except Exception:
                shift_start = datetime.datetime.combine(assign.date, st_time)
                shift_end = datetime.datetime.combine(assign.date, en_time)

            driver_name = assign.transport_driver_name or getattr(staff, 'transport_driver_name', '') or ''
            driver_phone = assign.transport_driver_phone or getattr(staff, 'transport_driver_phone', '') or ''
            raw_pt = assign.transport_pickup_time or getattr(staff, 'transport_pickup_time', '') or ''
            pickup_time = raw_pt if (raw_pt and str(raw_pt).strip()) else None
            buddy_obj = assign.buddy_staff or getattr(staff, 'buddy_staff', None)

            shifts.append({
                'id': f"roster_{assign.id}",
                'assignment_id': assign.id,
                'start': shift_start.isoformat(),
                'end': shift_end.isoformat(),
                'type': assign.shift_name,
                'status': 'scheduled',
                'is_roster_shift': True,
                'color': assign.color,
                'patient': {
                    'id': None,
                    'name': 'Hospital Clinical Duty',
                    'diagnosis': assign.shift_name,
                    'location': assign.location or 'Hospital Branch / Clinical Field',
                    'patient_code': 'ROSTER',
                },
                'supervisor': None,
                'transport': {
                    'driver_name': driver_name or 'Staff Transport Van',
                    'driver_phone': driver_phone,
                    'pickup_time': pickup_time,
                } if (driver_name or pickup_time) else None,
                'buddy': {
                    'name': buddy_obj.full_name,
                    'phone': buddy_obj.phone,
                } if buddy_obj and buddy_obj.id != staff.id else None,
            })

        from urllib.parse import quote
        from staff_portal.duty_countdown import calculate_duty_countdown
        now_utc = timezone.now()
        local_now = now_utc.astimezone(local_tz)

        # Build duties list matching Part B2 (Nurse Sees "My Roster")
        duties = []
        for assign in published_roster:
            if assign.is_off:
                continue
            st_time = assign.start_time or datetime.time(8, 0)
            en_time = assign.end_time or datetime.time(16, 0)
            is_overnight = (en_time <= st_time)
            try:
                shift_start = timezone.make_aware(datetime.datetime.combine(assign.date, st_time), timezone=local_tz)
                shift_end = timezone.make_aware(
                    datetime.datetime.combine(assign.date + (datetime.timedelta(days=1) if is_overnight else datetime.timedelta()), en_time),
                    timezone=local_tz
                )
            except Exception:
                shift_start = datetime.datetime.combine(assign.date, st_time)
                shift_end = datetime.datetime.combine(assign.date, en_time)

            driver_staff = getattr(assign, 'driver', None)
            driver_name = (driver_staff.full_name if driver_staff else None) or assign.transport_driver_name or None
            driver_phone = (driver_staff.phone if driver_staff else None) or assign.transport_driver_phone or None
            raw_pt = (assign.driver_pickup_time.strftime('%I:%M %p') if getattr(assign, 'driver_pickup_time', None) else None) or assign.transport_pickup_time or None
            pickup_time = raw_pt if (raw_pt and str(raw_pt).strip()) else None

            supervisor_obj = getattr(assign, 'supervisor', None)
            buddy_obj = assign.buddy_staff

            has_supervisor = bool(supervisor_obj)
            has_transport = bool(driver_name or pickup_time)
            has_buddy = bool(buddy_obj)
            is_independent = not (has_supervisor or has_transport or has_buddy)

            duty_time_str = f"{st_time.strftime('%I:%M %p').lstrip('0')} - {en_time.strftime('%I:%M %p').lstrip('0')}"

            # Assigned patients
            assigned_patients = list(assign.patients.all())
            if not assigned_patients:
                b_pats = [b.patient for b in bookings if b.scheduled_time.date() == assign.date and b.patient]
                assigned_patients = b_pats

            patients_data = []
            for p in assigned_patients:
                p_loc = p.address or 'Not recorded'
                maps_link = f"https://www.google.com/maps/search/?api=1&query={quote(p_loc)}" if p_loc and p_loc != 'Not recorded' else ''
                patients_data.append({
                    'id': p.id,
                    'name': p.full_name,
                    'age': p.age,
                    'diagnosis': p.primary_diagnosis or 'Not recorded',
                    'location': p_loc,
                    'maps_link': maps_link,
                })

            countdown_info = calculate_duty_countdown(shift_start, shift_end, local_now)

            duty_item = {
                'id': f"duty_roster_{assign.id}",
                'assignment_id': assign.id,
                'date': assign.date.isoformat(),
                'start': shift_start.isoformat(),
                'end': shift_end.isoformat(),
                'duty_time': duty_time_str,
                'is_overnight': is_overnight,
                'countdown': countdown_info,
                'patients': patients_data,
                'supervisor': {
                    'name': supervisor_obj.full_name,
                    'phone': supervisor_obj.phone,
                } if supervisor_obj else None,
                'transport': {
                    'driver_name': driver_name,
                    'driver_phone': driver_phone or '',
                    'pickup_time': pickup_time or '',
                } if has_transport else None,
                'buddy': {
                    'name': buddy_obj.full_name,
                    'phone': buddy_obj.phone,
                } if buddy_obj else None,
                'is_independent': is_independent,
                'duty_type': 'Independent duty' if is_independent else 'Supported duty',
            }
            duties.append(duty_item)

        # Sort shifts and duties by start time
        shifts.sort(key=lambda s: s['start'])
        duties.sort(key=lambda d: d['start'])

        return Response({
            'view': view_mode,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'shifts': shifts,
            'duties': duties,
            'count': len(duties),
        })


# ── 3. GET /api/staff-portal/patients/ ────────────────────────────────────────

class StaffPortalPatientsListView(APIView):
    """
    List only patients assigned to the logged-in nurse via active, upcoming,
    or recent non-cancelled bookings. Supports search, status filter, and pagination.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        staff = _resolve_staff_member(request.user)
        user_role = get_user_role(request.user)
        if not staff and user_role not in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Response({'count': 0, 'results': []})

        from patients.scoping import get_assigned_patient_ids_for_clinician
        assigned_ids = get_assigned_patient_ids_for_clinician(request.user)
        qs = Patient.objects.all()
        if assigned_ids is not None:
            qs = qs.filter(id__in=assigned_ids)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(mr_number__icontains=search) |
                Q(patient_code__icontains=search)
            )

        status_filter = request.query_params.get('status')
        if status_filter == 'active':
            qs = qs.filter(is_active=True)
        elif status_filter == 'inactive':
            qs = qs.filter(is_active=False)

        total_count = qs.count()

        try:
            page = int(request.query_params.get('page', 1))
            page_size = int(request.query_params.get('page_size', 20))
        except (ValueError, TypeError):
            page, page_size = 1, 20

        start = (page - 1) * page_size
        end = start + page_size
        page_items = qs.select_related('assigned_care_manager').order_by('-created_at')[start:end]

        results = []
        now = timezone.now()
        from staff.pin_service import is_patient_unlocked_for_user
        for p in page_items:
            is_unlocked, _ = is_patient_unlocked_for_user(request.user, p.id, now=now)
            is_file_locked = not is_unlocked
            next_booking = (
                p.bookings.filter(
                    scheduled_time__gte=now - datetime.timedelta(hours=2)
                ).exclude(
                    status=BookingStatus.CANCELLED
                ).order_by('scheduled_time').first()
            )
            latest_v = VitalSign.objects.filter(patient=p, is_entered_in_error=False).order_by('-recorded_at').first() if is_unlocked else None
            tier_res = _classify_patient_vitals(latest_v, now) if is_unlocked else ('locked', None)
            tier = tier_res[0] if isinstance(tier_res, (tuple, list)) else tier_res
            has_complaint = (p.active_complaints.filter(resolved_at__isnull=True).exists() if hasattr(p, 'active_complaints') else False) if is_unlocked else False

            results.append({
                'id': p.id,
                'name': p.full_name,
                'mr_number': p.mr_number,
                'patient_code': p.patient_code or f"PT-{p.id}",
                'age': p.age if is_unlocked else None,
                'gender': (p.get_gender_display() if hasattr(p, 'get_gender_display') else p.gender) if is_unlocked else '',
                'diagnosis': (p.primary_diagnosis or 'Under clinical observation') if is_unlocked else 'Locked — Enter Duty PIN',
                'location': p.address,
                'is_active': p.is_active,
                'is_file_locked': is_file_locked,
                'has_active_complaint': has_complaint,
                'latest_tier': tier,
                'next_visit': next_booking.scheduled_time.isoformat() if next_booking else None,
                'next_visit_type': next_booking.get_service_type_display() if next_booking and hasattr(next_booking, 'get_service_type_display') else (next_booking.service_type if next_booking else None),
            })

        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'results': results,
        })


# ── 4. GET /api/staff-portal/patients/<id>/ ───────────────────────────────────

class StaffPortalPatientDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        staff = _resolve_staff_member(request.user)
        user_role = get_user_role(request.user)

        patient = get_object_or_404(Patient, pk=pk)
        from patients.scoping import check_clinician_patient_access
        check_clinician_patient_access(request.user, patient)

        # Security Audit Log entry
        actor_name = staff.full_name if staff else request.user.get_full_name() or request.user.username
        emp_id = staff.employee_id if staff else 'ADMIN'
        AuditLog.objects.create(
            actor=request.user,
            actor_name=actor_name,
            action='Read Patient Record',
            target_user=patient.full_name,
            details=f"Staff {emp_id} ({user_role}) viewed clinical record for patient MRN {patient.mr_number} (ID {patient.id})",
            ip_address=request.META.get('REMOTE_ADDR'),
            timestamp=timezone.now()
        )

        open_family_concern_count = FamilyConcern.objects.filter(
            patient=patient,
            status=FamilyConcern.Status.OPEN
        ).count()

        # Build chart endpoints links
        chart_links = {
            'medication_chart': f"/api/patients/{patient.id}/mar/",
            'prescriptions': f"/api/patients/{patient.id}/prescriptions/",
            'nursing_notes': f"/api/patients/{patient.id}/notes/",
            'vitals_and_intake_output': f"/api/patients/{patient.id}/vitals/",
            'doctor_notes': f"/api/patients/{patient.id}/doctor-notes/",
            'physiotherapy': f"/api/patients/{patient.id}/physio-notes/",
            'manager_checklist': f"/api/patients/{patient.id}/manager-checklist/",
            'family_concerns': f"/api/staff-portal/family-concerns/?patient={patient.id}",
        }

        # Demographics & Care Plan
        active_booking = patient.bookings.filter(
            status__in=[BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS]
        ).first()

        care_plan = {
            'diagnosis': patient.primary_diagnosis or (active_booking.diagnosis if active_booking else ''),
            'allergy_status': getattr(patient, 'allergy_status', 'not_recorded'),
            'allergy_status_display': patient.get_allergy_status_display() if hasattr(patient, 'get_allergy_status_display') else 'Allergies not recorded',
            'allergies': patient.allergies or '',
            'blood_type': patient.blood_type or 'Unknown',
            'care_manager': patient.assigned_care_manager.full_name if patient.assigned_care_manager else 'Assigned Care Coordinator',
            'clinical_requirements': active_booking.clinical_requirements if active_booking else '',
            'service_type': active_booking.service_type if active_booking else 'Home Nursing Care',
        }

        return Response({
            'id': patient.id,
            'name': patient.full_name,
            'mr_number': patient.mr_number,
            'patient_code': patient.patient_code or f"PT-{patient.id}",
            'age': patient.age,
            'gender': patient.get_gender_display(),
            'location': {
                'address': patient.address,
                'latitude': float(patient.latitude) if patient.latitude else None,
                'longitude': float(patient.longitude) if patient.longitude else None,
            },
            'medical_history': patient.secondary_diagnoses or 'None documented',
            'current_care_plan': care_plan,
            'open_family_concern_count': open_family_concern_count,
            'chart_links': chart_links,
        })


# ── 4. Staff Requests (POST / GET requests/) ──────────────────────────────────

class StaffRequestViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_throttles(self):
        if self.action in ['create', 'review_action']:
            return [StaffPortalPostThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action == 'create':
            return StaffRequestCreateSerializer
        return StaffRequestSerializer

    def get_queryset(self):
        staff = _resolve_staff_member(self.request.user)
        user_role = get_user_role(self.request.user)
        if user_role in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return StaffRequest.objects.all().select_related('staff', 'patient', 'reviewed_by').order_by('-created_at')
        if not staff:
            return StaffRequest.objects.none()
        return StaffRequest.objects.filter(staff=staff).select_related('staff', 'patient', 'reviewed_by').order_by('-created_at')

    def perform_create(self, serializer):
        staff = _resolve_staff_member(self.request.user)
        if not staff:
            raise permissions.exceptions.PermissionDenied("Only active staff members may submit requests.")

        patient = serializer.validated_data.get('patient')
        req_type = serializer.validated_data.get('request_type')
        urgency = serializer.validated_data.get('urgency', 'routine')

        instance = serializer.save(staff=staff, status=StaffRequest.Status.PENDING)

        # Notify Care Coordinator / Supervisor
        reviewer_recipients = StaffMember.objects.filter(
            role__in=['care_manager', 'branch_manager', 'admin'],
            user__isnull=False
        )
        patient_name = patient.full_name if patient else 'General Patient'
        for recipient in reviewer_recipients[:3]:
            create_notification(
                recipient_user=recipient.user,
                message=f"[{urgency.upper()}] Staff Request ({instance.get_request_type_display()}) raised by {staff.full_name} for {patient_name}.",
                icon_key='alert' if urgency != 'routine' else 'bell',
            )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def review_action(self, request, pk=None):
        """Management review: acknowledge, in_progress, done, reject."""
        user_role = get_user_role(request.user)
        if user_role not in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Response({'detail': 'Manager privileges required.'}, status=status.HTTP_403_FORBIDDEN)

        instance = self.get_object()
        new_status = request.data.get('status')
        reviewer_notes = request.data.get('reviewer_notes', '')

        if new_status not in [choice[0] for choice in StaffRequest.Status.choices]:
            return Response({'detail': f"Invalid status: {new_status}"}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = new_status
        instance.reviewer_notes = reviewer_notes
        instance.reviewed_by = request.user
        instance.reviewed_at = timezone.now()
        instance.save()

        # Notify staff of review
        if instance.staff.user:
            create_notification(
                recipient_user=instance.staff.user,
                message=f"Your request '{instance.get_request_type_display()}' has been updated to: {instance.get_status_display()}.",
                icon_key='bell',
            )

        return Response(StaffRequestSerializer(instance).data)


# ── 5. Overtime Claims (POST / GET overtime-claims/) ──────────────────────────

class OvertimeClaimViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OvertimeClaimSerializer
    pagination_class = StandardResultsPagination

    def get_throttles(self):
        if self.action in ['create', 'review']:
            return [StaffPortalPostThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        staff = _resolve_staff_member(self.request.user)
        user_role = get_user_role(self.request.user)
        if user_role in ('super_admin', 'admin', 'branch_manager', 'care_manager', 'accountant'):
            return OvertimeClaim.objects.all().select_related('staff', 'reviewer').order_by('-date', '-created_at')
        if not staff:
            return OvertimeClaim.objects.none()
        return OvertimeClaim.objects.filter(staff=staff).select_related('staff', 'reviewer').order_by('-date', '-created_at')

    def create(self, request, *args, **kwargs):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response({'detail': 'Active staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        claim_date_str = request.data.get('date')
        hours = request.data.get('hours')
        reason = request.data.get('reason', '')
        booking_id = request.data.get('booking')

        if not claim_date_str or not hours:
            return Response({'detail': 'Date and hours are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            claim_date = datetime.date.fromisoformat(claim_date_str)
            hours_dec = Decimal(str(hours))
            if hours_dec <= 0:
                raise ValueError()
        except Exception:
            return Response({'detail': 'Invalid date or hours value.'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.now().date()
        window_days = getattr(settings, 'OVERTIME_CLAIM_WINDOW_DAYS', 2)

        # 1. Claim window validation
        if claim_date > today:
            return Response({'detail': 'Cannot submit overtime claims for future dates.'}, status=status.HTTP_400_BAD_REQUEST)

        if (today - claim_date).days > window_days:
            return Response(
                {'detail': f"Claims must be submitted within {window_days} days of the shift date."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Duplicate claim check (one claim per shift/date)
        if OvertimeClaim.objects.filter(staff=staff, date=claim_date).exists():
            return Response(
                {'detail': f"An overtime claim already exists for {claim_date}. Duplicate claims are not allowed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 3. Derive maximum claimable overtime from attendance / booking
        derived_max_hours = Decimal('0.00')
        attendance = AttendanceRecord.objects.filter(staff=staff, date=claim_date).first()
        if attendance and attendance.overtime_hours > 0:
            derived_max_hours = attendance.overtime_hours
        elif attendance and attendance.total_hours > 0:
            # Shift standard is 8 hours; remainder is overtime
            if attendance.total_hours > Decimal('8.00'):
                derived_max_hours = attendance.total_hours - Decimal('8.00')
            else:
                derived_max_hours = Decimal('2.00')  # Default allowable tolerance
        else:
            # Fallback based on booking schedule
            booking = None
            if booking_id:
                booking = Booking.objects.filter(id=booking_id, assigned_staff=staff).first()
            if not booking:
                booking = Booking.objects.filter(assigned_staff=staff, scheduled_time__date=claim_date).first()

            if booking and booking.actual_start_time and booking.actual_end_time:
                duration_hrs = Decimal(str(round((booking.actual_end_time - booking.actual_start_time).total_seconds() / 3600, 2)))
                base_hrs = Decimal('12.00' if '12' in booking.shift_duration else ('8.00' if '8' in booking.shift_duration else '4.00'))
                if duration_hrs > base_hrs:
                    derived_max_hours = duration_hrs - base_hrs
            else:
                derived_max_hours = Decimal('3.00')

        if hours_dec > derived_max_hours:
            return Response(
                {'detail': f"Claimed hours ({hours_dec}) exceed the derived maximum of {derived_max_hours} hours for this shift."},
                status=status.HTTP_400_BAD_REQUEST
            )

        claim = OvertimeClaim.objects.create(
            staff=staff,
            booking_id=booking_id if booking_id else None,
            date=claim_date,
            hours=hours_dec,
            derived_max_hours=derived_max_hours,
            reason=reason,
            status=OvertimeClaim.Status.PENDING,
        )

        return Response(OvertimeClaimSerializer(claim).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        """Manager / HR / Accountant review."""
        user_role = get_user_role(request.user)
        if user_role not in ('super_admin', 'admin', 'branch_manager', 'care_manager', 'accountant'):
            return Response({'detail': 'Manager or Accountant privileges required.'}, status=status.HTTP_403_FORBIDDEN)

        claim = self.get_object()
        action_type = request.data.get('action')  # 'approve', 'reject', 'paid'
        reviewer_note = request.data.get('note', '')

        if action_type == 'approve':
            claim.status = OvertimeClaim.Status.APPROVED
        elif action_type == 'reject':
            claim.status = OvertimeClaim.Status.REJECTED
        elif action_type == 'paid':
            if user_role not in ('super_admin', 'admin', 'accountant'):
                return Response({'detail': 'Only Finance / Accountant can mark claims as paid.'}, status=status.HTTP_403_FORBIDDEN)
            claim.status = OvertimeClaim.Status.PAID
        else:
            return Response({'detail': f"Invalid action: {action_type}"}, status=status.HTTP_400_BAD_REQUEST)

        claim.reviewer = request.user
        claim.reviewer_note = reviewer_note
        claim.reviewed_at = timezone.now()
        claim.save()

        if claim.staff.user:
            create_notification(
                recipient_user=claim.staff.user,
                message=f"Your overtime claim for {claim.date} ({claim.hours}h) was {claim.status.upper()}.",
                icon_key='calendar',
            )

        return Response(OvertimeClaimSerializer(claim).data)


# ── 6. Complaints, Resignations, Permissions, Policies, Employee Card ─────────

class ComplaintViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ComplaintSerializer
    pagination_class = StandardResultsPagination

    def get_throttles(self):
        if self.action in ['create', 'resolve']:
            return [StaffPortalPostThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        staff = _resolve_staff_member(self.request.user)
        user_role = get_user_role(self.request.user)
        if user_role in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Complaint.objects.all().select_related('staff', 'resolved_by').order_by('-created_at')
        if not staff:
            return Complaint.objects.none()
        return Complaint.objects.filter(staff=staff).select_related('staff', 'resolved_by').order_by('-created_at')

    def perform_create(self, serializer):
        staff = _resolve_staff_member(self.request.user)
        if not staff:
            raise permissions.exceptions.PermissionDenied("Staff profile required.")
        serializer.save(staff=staff, status=Complaint.Status.PENDING)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        user_role = get_user_role(request.user)
        if user_role not in ('super_admin', 'admin', 'branch_manager'):
            return Response({'detail': 'Admin privileges required.'}, status=status.HTTP_403_FORBIDDEN)

        complaint = self.get_object()
        complaint.status = Complaint.Status.RESOLVED
        complaint.resolution_note = request.data.get('resolution_note', '')
        complaint.resolved_by = request.user
        complaint.resolved_at = timezone.now()
        complaint.save()
        return Response(ComplaintSerializer(complaint).data)


class ResignationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ResignationRequestSerializer
    pagination_class = StandardResultsPagination

    def get_throttles(self):
        if self.action in ['create', 'withdraw', 'review']:
            return [StaffPortalPostThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        staff = _resolve_staff_member(self.request.user)
        user_role = get_user_role(self.request.user)
        if user_role in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return ResignationRequest.objects.all().select_related('staff', 'reviewer').order_by('-created_at')
        if not staff:
            return ResignationRequest.objects.none()
        return ResignationRequest.objects.filter(staff=staff).select_related('staff', 'reviewer').order_by('-created_at')

    def create(self, request, *args, **kwargs):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response({'detail': 'Staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        # Only one active request allowed
        active_res = ResignationRequest.objects.filter(staff=staff, status=ResignationRequest.Status.PENDING).first()
        if active_res:
            return Response(
                {'detail': 'You already have an active pending resignation request.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reason = request.data.get('reason')
        if not reason:
            return Response({'detail': 'Reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        notice_period = getattr(settings, 'RESIGNATION_NOTICE_PERIOD_DAYS', 30)
        last_working_day = timezone.now().date() + datetime.timedelta(days=notice_period)

        resignation = ResignationRequest.objects.create(
            staff=staff,
            reason=reason,
            notice_period_days=notice_period,
            last_working_day=last_working_day,
            status=ResignationRequest.Status.PENDING,
        )

        return Response(ResignationRequestSerializer(resignation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def withdraw(self, request, pk=None):
        staff = _resolve_staff_member(request.user)
        resignation = self.get_object()

        if resignation.staff != staff and not request.user.is_superuser:
            return Response({'detail': 'You may only withdraw your own resignation.'}, status=status.HTTP_403_FORBIDDEN)

        if resignation.status != ResignationRequest.Status.PENDING:
            return Response({'detail': 'Only pending resignations can be withdrawn.'}, status=status.HTTP_400_BAD_REQUEST)

        resignation.status = ResignationRequest.Status.WITHDRAWN
        resignation.save()
        return Response(ResignationRequestSerializer(resignation).data)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        user_role = get_user_role(request.user)
        if user_role not in ('super_admin', 'admin', 'branch_manager'):
            return Response({'detail': 'Admin privileges required.'}, status=status.HTTP_403_FORBIDDEN)

        resignation = self.get_object()
        action_type = request.data.get('action')  # accept, reject
        note = request.data.get('note', '')

        if action_type == 'accept':
            resignation.status = ResignationRequest.Status.ACCEPTED
        elif action_type == 'reject':
            resignation.status = ResignationRequest.Status.REJECTED
        else:
            return Response({'detail': 'Action must be accept or reject.'}, status=status.HTTP_400_BAD_REQUEST)

        resignation.reviewer = request.user
        resignation.reviewer_note = note
        resignation.reviewed_at = timezone.now()
        resignation.save()

        if resignation.staff.user:
            create_notification(
                recipient_user=resignation.staff.user,
                message=f"Your resignation request has been {resignation.status.upper()}.",
                icon_key='alert',
            )

        return Response(ResignationRequestSerializer(resignation).data)


class PermissionRequestViewSet(viewsets.ModelViewSet):
    """Short leave by time range; uses LeaveRequest with is_permission=True."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PermissionRequestSerializer
    pagination_class = StandardResultsPagination

    def get_throttles(self):
        if self.action in ['create', 'review']:
            return [StaffPortalPostThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        staff = _resolve_staff_member(self.request.user)
        user_role = get_user_role(self.request.user)
        if user_role in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return LeaveRequest.objects.filter(is_permission=True).select_related('staff', 'reviewed_by').order_by('-created_at')
        if not staff:
            return LeaveRequest.objects.none()
        return LeaveRequest.objects.filter(staff=staff, is_permission=True).select_related('staff', 'reviewed_by').order_by('-created_at')

    def create(self, request, *args, **kwargs):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response({'detail': 'Staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        date_val = request.data.get('date') or request.data.get('start_date')
        start_time = request.data.get('start_time')
        end_time = request.data.get('end_time')
        reason = request.data.get('reason')

        if not date_val or not start_time or not end_time or not reason:
            return Response({'detail': 'Date, start_time, end_time, and reason are required.'}, status=status.HTTP_400_BAD_REQUEST)

        leave_req = LeaveRequest.objects.create(
            staff=staff,
            leave_type=LeaveRequest.LeaveType.ANNUAL,
            start_date=date_val,
            end_date=date_val,
            is_permission=True,
            start_time=start_time,
            end_time=end_time,
            reason=reason,
            status=LeaveRequest.LeaveStatus.PENDING,
        )

        return Response(PermissionRequestSerializer(leave_req).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        user_role = get_user_role(request.user)
        if user_role not in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Response({'detail': 'Manager privileges required.'}, status=status.HTTP_403_FORBIDDEN)

        permission_obj = self.get_object()
        action_type = request.data.get('action')  # approve, reject

        if action_type == 'approve':
            permission_obj.status = LeaveRequest.LeaveStatus.APPROVED
        elif action_type == 'reject':
            permission_obj.status = LeaveRequest.LeaveStatus.REJECTED
        else:
            return Response({'detail': 'Action must be approve or reject.'}, status=status.HTTP_400_BAD_REQUEST)

        permission_obj.reviewed_by = request.user
        permission_obj.save()

        if permission_obj.staff.user:
            create_notification(
                recipient_user=permission_obj.staff.user,
                message=f"Your permission request for {permission_obj.start_date} was {permission_obj.status.upper()}.",
                icon_key='calendar',
            )

        return Response(PermissionRequestSerializer(permission_obj).data)


class CompanyPolicyViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CompanyPolicySerializer
    queryset = CompanyPolicy.objects.filter(is_active=True).order_by('title')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['staff'] = _resolve_staff_member(self.request.user)
        return context

    @action(detail=True, methods=['post'], throttle_classes=[StaffPortalPostThrottle])
    def acknowledge(self, request, pk=None):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response({'detail': 'Staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        policy = self.get_object()
        ack, created = PolicyAcknowledgement.objects.get_or_create(policy=policy, staff=staff)
        return Response({
            'status': 'acknowledged',
            'policy_id': policy.id,
            'acknowledged_at': ack.acknowledged_at.isoformat(),
        })


class EmployeeCardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response({'detail': 'Staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        # Strictly prevent reading another staff member's ID card via query parameter
        target_id = request.query_params.get('id') or request.query_params.get('staff_id') or request.query_params.get('employee_id')
        if target_id and str(target_id) not in (str(staff.id), str(staff.employee_id)):
            return Response({'detail': 'Forbidden. Clinicians may access their own staff card only.'}, status=status.HTTP_403_FORBIDDEN)

        signer = signing.TimestampSigner(salt='staff-id-card')
        signed_token = signer.sign(str(staff.id))

        photo_url = staff.photo.url if staff.photo else None
        role_label = staff.designation or staff.get_role_display() or 'Clinical Staff'

        return Response({
            'employee_id': staff.employee_id,
            'name': staff.full_name,
            'full_name': staff.full_name,
            'role': staff.role,
            'role_display': role_label,
            'designation': staff.designation or role_label,
            'department': staff.specialization or 'Clinical Field Care',
            'specialization': staff.specialization or 'Clinical Field Care',
            'branch': 'Islamabad Operations Branch',
            'contact': staff.phone or staff.email or 'Staff Dispatch',
            'phone': staff.phone or '',
            'email': staff.email or '',
            'photo': photo_url,
            'photo_url': photo_url,
            'employment_type': 'Full-time Clinical Specialist',
            'duty_status': staff.status or 'available',
            'status': staff.status or 'available',
            'hospital_contact_phone': getattr(settings, 'HOSPITAL_CONTACT_PHONE', '') or None,
            'verification_token': signed_token,
            'verify_url': f"/api/staff/verify/{signed_token}/",
        })


class PublicStaffVerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [StaffVerifyRateThrottle]

    def get(self, request, token):
        staff = None
        signer = signing.TimestampSigner(salt='staff-id-card')
        try:
            staff_id_str = signer.unsign(token, max_age=86400 * 365)
            staff = StaffMember.objects.filter(id=int(staff_id_str)).first()
        except Exception:
            # Fallback to direct lookup on verification_token field
            staff = StaffMember.objects.filter(verification_token=token).first()

        if not staff:
            return Response(
                {'detail': 'Staff verification token is invalid or expired.'},
                status=status.HTTP_404_NOT_FOUND
            )

        photo_url = staff.photo.url if staff.photo else None
        role_label = staff.designation or staff.get_role_display() or 'Nurse'

        # Leaks strictly nothing extra — no phone, no email, no patients, no address
        data = {
            'name': staff.full_name,
            'role': role_label,
            'photo_url': photo_url,
            'is_active': staff.status != 'inactive',
            'employee_id': staff.employee_id,
        }
        return Response(PublicStaffVerifySerializer(data).data)


# ── 7. Family Concerns ─────────────────────────────────────────────────────────

class FamilyConcernViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_throttles(self):
        if self.action in ['create', 'respond']:
            return [StaffPortalPostThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action == 'create':
            return FamilyConcernCreateSerializer
        if self.action == 'respond':
            return FamilyConcernRespondSerializer
        return FamilyConcernSerializer

    def get_queryset(self):
        user = self.request.user
        staff = _resolve_staff_member(user)
        user_role = get_user_role(user)

        qs = FamilyConcern.objects.all().select_related('patient', 'raised_by', 'responded_by').order_by('-created_at')

        # Filter params
        patient_id = self.request.query_params.get('patient')
        chart_type = self.request.query_params.get('chart')
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        if chart_type:
            qs = qs.filter(chart_type=chart_type)

        if user_role in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return qs

        if staff:
            # Nurse sees concerns for patients assigned to them
            assigned_patient_ids = Booking.objects.filter(
                Q(assigned_staff=staff) | Q(buddy=staff)
            ).values_list('patient_id', flat=True).distinct()
            return qs.filter(patient_id__in=assigned_patient_ids)

        if is_family_user(user):
            linked_patient = getattr(user, 'patient_profile', None)
            if linked_patient:
                return qs.filter(patient=linked_patient)
            return qs.filter(raised_by=user)

        return qs.none()

    def create(self, request, *args, **kwargs):
        """Family side: raise a concern tied to a chart."""
        serializer = FamilyConcernCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient = serializer.validated_data['patient']
        user = request.user

        # Authorization: family user must own the patient, or staff/admin
        if is_family_user(user):
            linked_patient = getattr(user, 'patient_profile', None)
            if not linked_patient or linked_patient.id != patient.id:
                return Response({'detail': 'You can only raise concerns for your registered family patient.'}, status=status.HTTP_403_FORBIDDEN)

        concern = serializer.save(raised_by=user, status=FamilyConcern.Status.OPEN)

        # Notify assigned clinical staff
        active_booking = patient.bookings.filter(status__in=[BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS]).first()
        if active_booking and active_booking.assigned_staff and active_booking.assigned_staff.user:
            create_notification(
                recipient_user=active_booking.assigned_staff.user,
                message=f"Family concern raised on {concern.get_chart_type_display()} for {patient.full_name}: {concern.message[:80]}",
                icon_key='alert',
            )

        return Response(FamilyConcernSerializer(concern).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        """Nurse / Manager response: acknowledge or resolve with note."""
        concern = self.get_object()
        serializer = FamilyConcernRespondSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action_type = serializer.validated_data['action']
        note = serializer.validated_data.get('note', '')

        if action_type == 'acknowledge':
            concern.status = FamilyConcern.Status.ACKNOWLEDGED
        elif action_type == 'resolve':
            concern.status = FamilyConcern.Status.RESOLVED

        concern.response_note = note
        concern.responded_by = request.user
        concern.responded_at = timezone.now()
        concern.save()

        # Notify family user
        if concern.raised_by:
            create_notification(
                recipient_user=concern.raised_by,
                message=f"Your concern regarding {concern.get_chart_type_display()} has been {concern.status}: {note[:80]}",
                icon_key='bell',
            )

        return Response(FamilyConcernSerializer(concern).data)


# ── 12. STAFF PORTAL LMS / TRAINING MODULE ─────────────────────────────────────

def _format_duration(seconds):
    if not seconds:
        return "—"
    m = seconds // 60
    s = seconds % 60
    return f"{m}m {s}s" if m > 0 else f"{s}s"


def _determine_lecture_type(lecture):
    if lecture.video_file or lecture.video_url or lecture.hls_master_url:
        return "video"
    if lecture.attachments:
        import os
        ext = os.path.splitext(lecture.attachments.name)[1].lower()
        if ext == '.pdf':
            return "pdf"
        return "document"
    return "text"


def _format_certificate_data(cert, request):
    if not cert:
        return None
    pdf_url = request.build_absolute_uri(cert.pdf_file.url) if cert.pdf_file else None
    return {
        'id': cert.id,
        'certificate_id': cert.certificate_id,
        'certificate_number': cert.certificate_number,
        'title': cert.title,
        'description': cert.description,
        'recipient_name': cert.recipient_name,
        'issue_date': str(cert.issue_date),
        'pdf_url': pdf_url,
        'download_url': request.build_absolute_uri(f"/api/staff-portal/certificates/{cert.id}/download/"),
        'verification_url': f"http://localhost:5173/verify-certificate/{cert.certificate_id}",
    }


class StaffPortalTrainingsListView(APIView):
    """
    GET /api/staff-portal/trainings/
    Returns list of courses assigned to the logged-in staff member.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response(
                {'detail': 'Authenticated user is not linked to an active staff member profile.'},
                status=status.HTTP_403_FORBIDDEN
            )

        from lms.models import CourseAssignment
        assignments = CourseAssignment.objects.filter(
            staff=staff
        ).select_related('course').prefetch_related('course__lectures', 'lecture_progresses', 'certificate')

        results = []
        now_date = timezone.now().date()
        for a in assignments:
            course = a.course
            lectures = course.lectures.all()
            total_lectures = lectures.count()
            completed_lectures = a.lecture_progresses.filter(completed=True).count()
            progress_pct = round(completed_lectures / total_lectures * 100) if total_lectures > 0 else 0

            status_val = a.status
            if a.status != CourseAssignment.Status.COMPLETED and a.due_date and a.due_date < now_date:
                status_val = 'overdue'

            cert = getattr(a, 'certificate', None)

            results.append({
                'course_id': course.id,
                'assignment_id': a.id,
                'title': course.title,
                'category': course.category,
                'category_display': course.get_category_display(),
                'description': course.description,
                'due_date': str(a.due_date) if a.due_date else None,
                'mandatory': bool(a.is_mandatory),
                'is_mandatory': bool(a.is_mandatory),
                'status': status_val,
                'status_display': 'Overdue' if status_val == 'overdue' else a.get_status_display(),
                'progress_pct': progress_pct,
                'completed_lectures': completed_lectures,
                'total_lectures': total_lectures,
                'assigned_date': str(a.assigned_date),
                'completed_date': str(a.completed_date) if a.completed_date else None,
                'certificate': _format_certificate_data(cert, request),
            })

        return Response(results)


class StaffPortalTrainingDetailView(APIView):
    """
    GET /api/staff-portal/trainings/<course_id>/
    Returns course details, full lecture list with watch progress, and certificate for logged-in nurse.
    If course is not assigned to her or belongs to another staff member, strictly returns 404.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, course_id):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response(
                {'detail': 'Authenticated user is not linked to an active staff member profile.'},
                status=status.HTTP_403_FORBIDDEN
            )

        from lms.models import CourseAssignment
        try:
            assignment = CourseAssignment.objects.select_related('course').prefetch_related(
                'course__lectures', 'lecture_progresses', 'certificate'
            ).get(staff=staff, course_id=course_id)
        except CourseAssignment.DoesNotExist:
            return Response(
                {'detail': 'Course not found or not assigned to your staff profile.'},
                status=status.HTTP_404_NOT_FOUND
            )

        course = assignment.course
        lectures = list(course.lectures.order_by('order'))
        total_lectures = len(lectures)
        progress_map = {p.lecture_id: p for p in assignment.lecture_progresses.all()}

        completed_lectures = sum(1 for lec in lectures if progress_map.get(lec.id) and progress_map[lec.id].completed)
        progress_pct = round(completed_lectures / total_lectures * 100) if total_lectures > 0 else 0

        status_val = assignment.status
        now_date = timezone.now().date()
        if assignment.status != CourseAssignment.Status.COMPLETED and assignment.due_date and assignment.due_date < now_date:
            status_val = 'overdue'

        cert = getattr(assignment, 'certificate', None)

        lectures_data = []
        for lec in lectures:
            prog = progress_map.get(lec.id)
            is_completed = bool(prog and prog.completed)
            lec_type = _determine_lecture_type(lec)

            video_url = None
            if lec.video_file:
                video_url = request.build_absolute_uri(lec.video_file.url)
            elif lec.video_url:
                video_url = lec.video_url

            file_url = request.build_absolute_uri(lec.attachments.url) if lec.attachments else None

            lectures_data.append({
                'id': lec.id,
                'title': lec.title,
                'order': lec.order,
                'type': lec_type,
                'duration': _format_duration(lec.duration_seconds),
                'duration_seconds': lec.duration_seconds,
                'completed': is_completed,
                'watched_seconds': prog.watched_seconds if prog else 0,
                'percentage': float(prog.percentage) if prog else 0.0,
                'last_position': prog.last_position if prog else 0,
                'video_url': video_url,
                'file_url': file_url,
                'description': lec.description,
            })

        return Response({
            'course_id': course.id,
            'assignment_id': assignment.id,
            'title': course.title,
            'category': course.category,
            'category_display': course.get_category_display(),
            'description': course.description,
            'due_date': str(assignment.due_date) if assignment.due_date else None,
            'mandatory': bool(assignment.is_mandatory),
            'is_mandatory': bool(assignment.is_mandatory),
            'status': status_val,
            'status_display': 'Overdue' if status_val == 'overdue' else assignment.get_status_display(),
            'progress_pct': progress_pct,
            'completed_lectures': completed_lectures,
            'total_lectures': total_lectures,
            'assigned_date': str(assignment.assigned_date),
            'completed_date': str(assignment.completed_date) if assignment.completed_date else None,
            'certificate': _format_certificate_data(cert, request),
            'lectures': lectures_data,
        })


class StaffPortalLectureProgressView(APIView):
    """
    POST /api/staff-portal/trainings/<course_id>/lectures/<lecture_id>/progress/
    Lets the nurse mark ONLY her own lecture progress (watched percent / completed).
    Server computes course progress and sets completed when all lectures are completed.
    A nurse cannot set progress for someone else, cannot mark a lecture of an unassigned course,
    and cannot set a course to completed directly.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, course_id, lecture_id):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response(
                {'detail': 'Authenticated user is not linked to an active staff member profile.'},
                status=status.HTTP_403_FORBIDDEN
            )

        from lms.models import CourseAssignment, Lecture, LectureProgress
        try:
            assignment = CourseAssignment.objects.select_related('course').get(staff=staff, course_id=course_id)
        except CourseAssignment.DoesNotExist:
            return Response(
                {'detail': 'Course not found or not assigned to your staff profile.'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            lecture = Lecture.objects.get(pk=lecture_id, course_id=course_id)
        except Lecture.DoesNotExist:
            return Response(
                {'detail': 'Lecture not found in this assigned course.'},
                status=status.HTTP_404_NOT_FOUND
            )

        watched_seconds = int(request.data.get('watched_seconds', 0))
        percentage = float(request.data.get('percentage', 0))
        position = int(request.data.get('position', 0))
        explicit_completed = bool(request.data.get('completed', False))

        progress, _ = LectureProgress.objects.get_or_create(
            assignment=assignment,
            lecture=lecture,
            defaults={'staff': staff}
        )
        progress.staff = staff
        if watched_seconds > progress.watched_seconds:
            progress.watched_seconds = watched_seconds
        if percentage > float(progress.percentage):
            progress.percentage = percentage
        if position > progress.last_position:
            progress.last_position = position

        if explicit_completed or float(progress.percentage) >= LectureProgress.COMPLETION_THRESHOLD_PCT:
            progress.completed = True
            if float(progress.percentage) < 100 and explicit_completed:
                progress.percentage = 100.0
        progress.save()

        # Recalculate course status on server side
        assignment.recalculate_status()
        assignment.refresh_from_db()

        total_lec = assignment.course.lectures.count()
        comp_lec = assignment.lecture_progresses.filter(completed=True).count()
        course_pct = round(comp_lec / total_lec * 100) if total_lec > 0 else 0

        cert = getattr(assignment, 'certificate', None)

        return Response({
            'success': True,
            'lecture_id': lecture.id,
            'watched_seconds': progress.watched_seconds,
            'percentage': float(progress.percentage),
            'completed': progress.completed,
            'course_progress_pct': course_pct,
            'course_status': assignment.status,
            'certificate': _format_certificate_data(cert, request),
        })


class StaffPortalCertificatesListView(APIView):
    """
    GET /api/staff-portal/certificates/
    Returns list of certificates issued to the logged-in staff member only.
    Certificate generation stays HR-only (read-only endpoint).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response(
                {'detail': 'Authenticated user is not linked to an active staff member profile.'},
                status=status.HTTP_403_FORBIDDEN
            )

        from lms.models import Certificate
        certs = Certificate.objects.filter(staff=staff).select_related('assignment', 'assignment__course')
        results = [_format_certificate_data(c, request) for c in certs]
        return Response(results)


class StaffPortalCertificateDownloadView(APIView):
    """
    GET /api/staff-portal/certificates/<int:pk>/download/
    Streams certificate PDF for the logged-in staff member only.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        staff = _resolve_staff_member(request.user)
        if not staff:
            return Response(
                {'detail': 'Authenticated user is not linked to an active staff member profile.'},
                status=status.HTTP_403_FORBIDDEN
            )

        from lms.models import Certificate
        try:
            cert = Certificate.objects.get(pk=pk, staff=staff)
        except Certificate.DoesNotExist:
            return Response(
                {'detail': 'Certificate not found or not belonging to you.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not cert.pdf_file:
            cert.generate_pdf(save_file=True)
            cert.refresh_from_db()

        if cert.pdf_file:
            try:
                pdf_file = cert.pdf_file.open('rb')
                response = FileResponse(pdf_file, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="{cert.certificate_id or cert.certificate_number}.pdf"'
                return response
            except Exception:
                pass

        pdf_bytes = cert.generate_pdf(save_file=False)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{cert.certificate_id or cert.certificate_number}.pdf"'
        return response
