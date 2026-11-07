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
from bookings.models import Booking, BookingStatus
from homecareOS.permissions import (
    IsAdminOrSuperAdmin,
    IsFinancialStaff,
    IsPatientOrFamilyOwner,
    get_user_role,
    is_family_user,
)
from notifications.models import Notification
from notifications.views import create_notification
from patients.models import DoctorNote, Patient, PhysioNote, VitalSign
from quality.models import ManagerVisitChecklist
from staff.models import AttendanceRecord, LeaveRequest, StaffMember

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
                VitalSign.objects.filter(patient=p).order_by('-recorded_at')[:6]
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
                'vitals': VitalSign.objects.filter(patient=p).count(),
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
                'allergies': getattr(p, 'allergies', None) or 'NKDA',
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
        assigned_patient_ids = list(
            Booking.objects.filter(Q(assigned_staff=staff) | Q(buddy=staff))
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
        today_start = timezone.make_aware(datetime.datetime.combine(local_now.date(), datetime.time.min))
        today_end = timezone.make_aware(datetime.datetime.combine(local_now.date(), datetime.time.max))
        patients_today_count = Booking.objects.filter(
            Q(assigned_staff=staff) | Q(buddy=staff),
            scheduled_time__range=[today_start, today_end]
        ).values('patient_id').distinct().count()

        pending_notes_count = 1 if any(a.get('type') == 'pending_notes' for a in deduped_alerts) else 0

        quick_stats = {
            'patients_today': max(1, patients_today_count) if target_booking else patients_today_count,
            'pending_notes': pending_notes_count,
            'active_alerts': len(deduped_alerts),
            'claims_pending': claims_summary['pending'],
        }

        # 7. Unread notifications
        unread_notifications = Notification.objects.filter(recipient=request.user, is_read=False).count()

        import hashlib
        staff_ts = staff.updated_at.isoformat() if staff.updated_at else ''
        booking_ts = target_booking.updated_at.isoformat() if target_booking and target_booking.updated_at else ''
        patient_ts = target_booking.patient.updated_at.isoformat() if target_booking and target_booking.patient and target_booking.patient.updated_at else ''
        version_str = f"{staff.id}_{staff.full_name}_{staff.designation}_{staff_ts}_{booking_ts}_{patient_ts}_{duty_state}_{len(deduped_alerts)}_{claims_summary['pending']}_{unread_notifications}"
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
            'claims_summary': claims_summary,
            'unread_notifications': unread_notifications,
        })


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
        for r in sr_qs.order_by('-created_at')[:20]:
            item = {
                'id': r.id,
                'patient_name': r.patient.full_name if r.patient else 'Unknown',
                'patient_code': r.patient.patient_code if r.patient else '',
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

        pending_requests = {
            'total_pending': len(pending_referrals) + len(pending_consultations) + len(pending_procedures),
            'referrals': pending_referrals,
            'consultations': pending_consultations,
            'procedures': pending_procedures,
        }

        # 5. High-Alert Patients (Critical, Less critical, Mild, Stable)
        from patients.scoping import get_assigned_patient_ids_for_clinician
        assigned_pids = get_assigned_patient_ids_for_clinician(request.user)
        pt_qs = Patient.objects.filter(is_active=True)
        if assigned_pids is not None:
            pt_qs = pt_qs.filter(id__in=assigned_pids)

        recent_window_hrs = getattr(settings, 'RECENT_VITALS_WINDOW_HOURS', 24)
        vitals_cutoff = now - datetime.timedelta(hours=recent_window_hrs)

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

        # Stable systolic upper limit removes overlap with mild (mild starts at 135)
        stable_sys_max = mild_th.get('systolic_min', 135) - 1

        high_alert_groups = {
            'critical': [],
            'less_critical': [],
            'mild': [],
            'unclassified': [],       # Outside baseline normal but matches no tier (Needs review)
            'no_recent_vitals': [],   # No vitals within recent window
            'stable': [],
        }

        for pt in pt_qs[:30]:
            latest_v = VitalSign.objects.filter(patient=pt).order_by('-recorded_at').first()
            if not latest_v or latest_v.recorded_at < vitals_cutoff:
                high_alert_groups['no_recent_vitals'].append({
                    'patient_id': pt.id,
                    'patient_name': pt.full_name,
                    'patient_code': pt.patient_code or f"PT-{pt.id}",
                    'mr_number': pt.mr_number,
                    'diagnosis': pt.primary_diagnosis or 'Under clinical care',
                    'last_recorded': latest_v.recorded_at.isoformat() if latest_v else None,
                    'reason': 'No recent vitals recorded within the past 24 hours' if latest_v else 'No vitals recorded',
                })
                continue

            v_dict = {
                'patient_id': pt.id,
                'patient_name': pt.full_name,
                'patient_code': pt.patient_code or f"PT-{pt.id}",
                'mr_number': pt.mr_number,
                'diagnosis': pt.primary_diagnosis or 'Under clinical care',
                'bp': f"{latest_v.blood_pressure_systolic}/{latest_v.blood_pressure_diastolic or '-'}" if latest_v.blood_pressure_systolic else '-',
                'hr': latest_v.heart_rate,
                'spo2': latest_v.spo2,
                'temp': float(latest_v.temperature) if latest_v.temperature else None,
                'blood_glucose': float(latest_v.blood_glucose) if latest_v.blood_glucose else None,
                'recorded_at': latest_v.recorded_at.isoformat(),
            }

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
            # 3. Mild Tier Check
            is_mild = (
                (sys is not None and mild_th.get('systolic_min', 999) <= sys <= mild_th.get('systolic_max', 0)) or
                (temp is not None and mild_th.get('temperature_min', 999.0) <= temp <= mild_th.get('temperature_max', 0.0))
            )
            # 4. Unclassified Safety Check (abnormal in baseline VITALS_THRESHOLDS but unbracketed in acute tiers)
            is_unclassified = (
                (sys is not None and (sys < sys_min or sys > stable_sys_max)) or
                (dia is not None and (dia < dia_min or dia > dia_max)) or
                (hr is not None and (hr < hr_min or hr > hr_max)) or
                (spo2 is not None and spo2 < spo2_min) or
                (temp is not None and (temp < temp_min or temp > temp_max)) or
                (bg is not None and (bg < bg_min or bg > bg_max))
            )

            if is_critical:
                high_alert_groups['critical'].append(v_dict)
            elif is_less_critical:
                high_alert_groups['less_critical'].append(v_dict)
            elif is_mild:
                high_alert_groups['mild'].append(v_dict)
            elif is_unclassified:
                # Value outside normal limits with no clinical acute tier (e.g. glucose 400, diastolic 130, hypothermia)
                reasons = []
                if dia is not None and (dia < dia_min or dia > dia_max):
                    reasons.append(f"Diastolic BP {dia} mmHg outside normal ({dia_min}-{dia_max})")
                if bg is not None and (bg < bg_min or bg > bg_max):
                    reasons.append(f"Blood glucose {bg} mg/dL outside normal ({bg_min}-{bg_max})")
                if temp is not None and temp < temp_min:
                    reasons.append(f"Hypothermia: Temperature {temp}°C below normal ({temp_min}°C)")
                if not reasons:
                    reasons.append("Vital signs outside baseline normal range - unclassified tier")
                v_dict['unclassified_reasons'] = reasons
                high_alert_groups['unclassified'].append(v_dict)
            else:
                high_alert_groups['stable'].append(v_dict)

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

        return Response({
            'staff': digital_id,
            'working_hours': working_hours,
            'today_visits': today_visits,
            'pending_requests': pending_requests,
            'high_alert_patients': high_alert_groups,
            'alert_thresholds_used': alert_thresholds_used,
            'provisional_note': 'PROVISIONAL - needs clinical sign-off',
            'quick_links': quick_links,
            'placeholders': placeholders,
        })


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

        return Response({
            'view': view_mode,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'shifts': shifts,
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
        for p in page_items:
            next_booking = (
                p.bookings.filter(
                    scheduled_time__gte=now - datetime.timedelta(hours=2)
                ).exclude(
                    status=BookingStatus.CANCELLED
                ).order_by('scheduled_time').first()
            )
            results.append({
                'id': p.id,
                'name': p.full_name,
                'mr_number': p.mr_number,
                'patient_code': p.patient_code or f"PT-{p.id}",
                'age': p.age,
                'gender': p.get_gender_display() if hasattr(p, 'get_gender_display') else p.gender,
                'diagnosis': p.primary_diagnosis or 'Under clinical observation',
                'location': p.address,
                'is_active': p.is_active,
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
            'allergies': patient.allergies or 'NKDA',
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

        signer = signing.TimestampSigner(salt='staff-id-card')
        signed_token = signer.sign(str(staff.id))

        photo_url = staff.photo.url if staff.photo else None
        role_label = staff.designation or staff.get_role_display() or 'Nurse'

        return Response({
            'employee_id': staff.employee_id,
            'name': staff.full_name,
            'role': role_label,
            'photo_url': photo_url,
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
