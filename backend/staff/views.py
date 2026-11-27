import json
from django.utils import timezone
from django.db.models import Q, Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from homecareOS.permissions import IsStaffManagementAllowed, IsCareManagerOrAdmin, get_user_role
from accounts.models import AuditLog, User
from patients.models import Patient
from bookings.models import Booking, BookingStatus
from .models import StaffMember, LeaveRequest, AttendanceRecord, RosterAssignment, StaffStageEvent, StaffRequirement
from .serializers import (
    StaffListSerializer, StaffDetailSerializer, StaffCreateSerializer,
    LeaveRequestSerializer, AttendanceRecordSerializer,
)


def log_staff_audit(actor, action, staff, details_dict=None, request=None):
    actor_name = (actor.get_full_name() or actor.username) if (actor and actor.is_authenticated) else 'System'
    target = getattr(staff.user, 'username', '') if getattr(staff, 'user', None) else staff.full_name
    ip = request.META.get('REMOTE_ADDR') if request else None
    details_str = json.dumps(details_dict) if details_dict else ''
    return AuditLog.objects.create(
        actor=actor if (actor and actor.is_authenticated) else None,
        actor_name=actor_name,
        action=action,
        target_user=target,
        details=details_str,
        ip_address=ip,
    )


def _batch_enrich_staff_list(items):
    if not items:
        return
    staff_ids = [s.id for s in items]
    today = timezone.now().date()
    now = timezone.now()

    # 1. Published today rosters
    rosters = RosterAssignment.objects.filter(
        staff_id__in=staff_ids,
        date=today,
        is_published=True,
        is_off=False,
    ).only('staff_id', 'shift_name', 'start_time', 'end_time')
    roster_map = {r.staff_id: r for r in rosters}

    # 2. Today's active / upcoming bookings
    today_bookings = Booking.objects.filter(
        Q(assigned_staff_id__in=staff_ids) | Q(buddy_id__in=staff_ids),
        scheduled_time__date=today,
    ).exclude(status__in=[BookingStatus.CANCELLED, BookingStatus.COMPLETED]).only(
        'assigned_staff_id', 'buddy_id', 'status', 'scheduled_time', 'shift_end_time'
    )
    on_visit_staff_ids = set()
    booking_map = {}
    for b in today_bookings:
        if b.assigned_staff_id:
            booking_map.setdefault(b.assigned_staff_id, []).append(b)
            if b.status == BookingStatus.IN_PROGRESS or (b.scheduled_time <= now and (b.shift_end_time is None or b.shift_end_time >= now)):
                on_visit_staff_ids.add(b.assigned_staff_id)
        if b.buddy_id:
            booking_map.setdefault(b.buddy_id, []).append(b)
            if b.status == BookingStatus.IN_PROGRESS:
                on_visit_staff_ids.add(b.buddy_id)

    # 3. Assigned patients count
    cm_patient_counts = dict(
        Patient.objects.filter(
            assigned_care_manager_id__in=staff_ids, is_active=True
        ).values('assigned_care_manager_id').annotate(c=Count('id')).values_list('assigned_care_manager_id', 'c')
    )
    booking_patient_records = Booking.objects.filter(
        Q(assigned_staff_id__in=staff_ids) | Q(buddy_id__in=staff_ids)
    ).exclude(status__in=[BookingStatus.CANCELLED, BookingStatus.COMPLETED]).values('assigned_staff_id', 'buddy_id', 'patient_id')
    patient_set_by_staff = {}
    for rec in booking_patient_records:
        pid = rec['patient_id']
        if rec['assigned_staff_id']:
            patient_set_by_staff.setdefault(rec['assigned_staff_id'], set()).add(pid)
        if rec['buddy_id']:
            patient_set_by_staff.setdefault(rec['buddy_id'], set()).add(pid)

    # 4. Docs progress
    reqs = StaffRequirement.objects.filter(
        staff_id__in=staff_ids,
        requirement_type__is_active=True,
    ).values('staff_id', 'requirement_type__gate', 'status')
    req_map = {}
    for r in reqs:
        key = (r['staff_id'], r['requirement_type__gate'])
        counts = req_map.setdefault(key, {'total': 0, 'completed': 0})
        counts['total'] += 1
        if r['status'] in ('verified', 'waived'):
            counts['completed'] += 1

    for s in items:
        # Today duty
        r = roster_map.get(s.id)
        if r:
            st = r.start_time.strftime('%H:%M') if r.start_time else ''
            en = r.end_time.strftime('%H:%M') if r.end_time else ''
            s._precomputed_today_duty = f"{st} - {en}" if (st and en) else (r.shift_name or 'Scheduled')
            s._precomputed_today_duty_name = r.shift_name or ''
            has_roster_duty = True
        else:
            b_list = booking_map.get(s.id, [])
            if b_list:
                first_b = b_list[0]
                st = first_b.scheduled_time.strftime('%H:%M') if first_b.scheduled_time else ''
                en = first_b.shift_end_time.strftime('%H:%M') if first_b.shift_end_time else ''
                s._precomputed_today_duty = f"{st} - {en}" if (st and en) else 'Scheduled'
                s._precomputed_today_duty_name = 'Visit'
                has_roster_duty = True
            else:
                s._precomputed_today_duty = 'None'
                s._precomputed_today_duty_name = ''
                has_roster_duty = False

        # Live status
        if not s.is_active:
            s._precomputed_live_status = 'inactive'
            s._precomputed_live_status_display = 'Inactive'
        elif s.id in on_visit_staff_ids or s.status == 'on_visit':
            s._precomputed_live_status = 'on_duty'
            s._precomputed_live_status_display = 'On duty now'
        elif s.status == 'available':
            s._precomputed_live_status = 'available'
            s._precomputed_live_status_display = 'Available'
        elif has_roster_duty:
            s._precomputed_live_status = 'available'
            s._precomputed_live_status_display = 'Available'
        else:
            s._precomputed_live_status = 'off_duty'
            s._precomputed_live_status_display = 'Off duty'

        # Assigned patients count
        b_count = len(patient_set_by_staff.get(s.id, set()))
        cm_count = cm_patient_counts.get(s.id, 0)
        s._precomputed_assigned_count = b_count + cm_count

        # Docs progress
        stage = getattr(s, 'lifecycle_stage', None)
        gate = 'trainee_to_probation' if stage == 'trainee' else ('probation_to_active' if stage == 'probation' else None)
        if gate:
            c_info = req_map.get((s.id, gate))
            if c_info and c_info['total'] > 0:
                s._precomputed_docs_progress = f"Docs {c_info['completed']}/{c_info['total']}"
            else:
                s._precomputed_docs_progress = None
        else:
            s._precomputed_docs_progress = None


class StaffPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class StaffViewSet(viewsets.ModelViewSet):
    queryset = StaffMember.objects.select_related('user').all().order_by('-created_at')
    permission_classes = [IsStaffManagementAllowed]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = StaffPagination

    def get_serializer_class(self):
        if self.action in ['list']:
            return StaffListSerializer
        if self.action in ['create']:
            return StaffCreateSerializer
        return StaffDetailSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        items = page if page is not None else list(queryset)

        # Batch enrich all items in O(1) queries avoiding N+1
        _batch_enrich_staff_list(items)

        if page is not None:
            serializer = self.get_serializer(items, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        staff = self.get_object()
        has_linked_records = (
            staff.bookings.exists() or
            staff.backup_bookings.exists() or
            staff.supervised_bookings.exists() or
            staff.buddy_bookings.exists() or
            staff.shift_buddy_bookings.exists() or
            staff.driver_duty_bookings.exists() or
            staff.roster_assignments.exists() or
            staff.supervised_roster_assignments.exists() or
            staff.buddy_roster_assignments.exists() or
            staff.driver_roster_assignments.exists() or
            staff.managed_patients.exists() or
            staff.vitalsign_set.exists() or
            staff.nursenote_set.exists() or
            staff.mar_administrations.exists() or
            staff.authored_doctor_notes.exists() or
            staff.authored_physio_notes.exists() or
            staff.authored_therapy_notes.exists() or
            staff.attendance_records.exists() or
            staff.leave_requests.exists()
        )
        if has_linked_records:
            return Response(
                {
                    "error": "cannot_delete_staff_with_records",
                    "detail": "Staff member has recorded clinical, booking, or roster history and cannot be physically deleted. Deactivate instead."
                },
                status=status.HTTP_409_CONFLICT
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get', 'post'], url_path='deactivate')
    def deactivate(self, request, pk=None):
        staff = self.get_object()
        actor = request.user
        actor_role = get_user_role(actor)

        # 1. Permissions: only admin and super_admin
        if actor_role not in ('super_admin', 'admin') and not getattr(actor, 'is_superuser', False):
            return Response({'detail': 'Only administrators can deactivate staff accounts.'}, status=status.HTTP_403_FORBIDDEN)

        target_user = staff.user

        # 2. At least one active super_admin must always remain
        if target_user:
            target_role = get_user_role(target_user)
            is_target_superadmin = (target_role == 'super_admin' or getattr(target_user, 'is_superuser', False))
            if is_target_superadmin:
                active_superadmins_count = User.objects.filter(
                    Q(is_superuser=True) | Q(profile__role='super_admin'),
                    is_active=True
                ).count()
                if active_superadmins_count <= 1:
                    return Response({'error': 'last_super_admin', 'detail': 'Cannot deactivate the last active super_admin in the system.'}, status=status.HTTP_400_BAD_REQUEST)

        # 3. An admin cannot deactivate a super_admin
        if actor_role == 'admin' and target_user:
            target_role = get_user_role(target_user)
            if target_role == 'super_admin' or getattr(target_user, 'is_superuser', False):
                return Response({'error': 'permission_denied', 'detail': 'Admin cannot deactivate a super_admin account.'}, status=status.HTTP_403_FORBIDDEN)

        # 4. An admin cannot deactivate themselves
        if target_user and target_user.id == actor.id:
            return Response({'error': 'cannot_deactivate_self', 'detail': 'You cannot deactivate your own account.'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.now().date()
        active_duties_count = staff.roster_assignments.filter(date__gte=today, is_published=True, is_off=False).count()
        active_bookings_count = Booking.objects.filter(
            Q(assigned_staff=staff) | Q(buddy=staff),
            scheduled_time__gte=timezone.now(),
            status__in=[BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS, BookingStatus.PENDING]
        ).count()
        managed_pts_count = staff.managed_patients.filter(is_active=True).count()

        if request.method == 'GET':
            return Response({
                'staff_id': staff.id,
                'staff_name': staff.full_name,
                'is_active': staff.is_active,
                'active_duties_count': active_duties_count,
                'active_bookings_count': active_bookings_count,
                'managed_patients_count': managed_pts_count,
                'total_active_commitments': active_duties_count + active_bookings_count + managed_pts_count,
            })

        # POST: execute deactivation
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'reason_required', 'detail': 'A reason is required to deactivate a staff account.'}, status=status.HTTP_400_BAD_REQUEST)

        staff.is_active = False
        staff.save(update_fields=['is_active'])
        if target_user:
            target_user.is_active = False
            target_user.save(update_fields=['is_active'])

        log_staff_audit(actor, 'staff_deactivated', staff, {
            'reason': reason,
            'active_duties_count': active_duties_count,
            'active_bookings_count': active_bookings_count,
            'managed_patients_count': managed_pts_count,
        }, request=request)

        return Response({
            'success': True,
            'message': f'{staff.full_name} has been deactivated.',
            'staff': StaffListSerializer(staff, context={'request': request}).data,
        })

    @action(detail=True, methods=['post'], url_path='reactivate')
    def reactivate(self, request, pk=None):
        staff = self.get_object()
        actor = request.user
        actor_role = get_user_role(actor)

        if actor_role not in ('super_admin', 'admin') and not getattr(actor, 'is_superuser', False):
            return Response({'detail': 'Only administrators can reactivate staff accounts.'}, status=status.HTTP_403_FORBIDDEN)

        staff.is_active = True
        staff.save(update_fields=['is_active'])
        if staff.user:
            staff.user.is_active = True
            staff.user.save(update_fields=['is_active'])

        log_staff_audit(actor, 'staff_reactivated', staff, {'staff_id': staff.id}, request=request)

        return Response({
            'success': True,
            'message': f'{staff.full_name} has been reactivated.',
            'staff': StaffListSerializer(staff, context={'request': request}).data,
        })

    @action(detail=True, methods=['post'], url_path='assign-patient')
    def assign_patient(self, request, pk=None):
        staff = self.get_object()
        actor = request.user
        actor_role = get_user_role(actor)

        if actor_role not in ('super_admin', 'admin') and not getattr(actor, 'is_superuser', False):
            return Response({'detail': 'You do not have permission to assign patients.'}, status=status.HTTP_403_FORBIDDEN)

        if getattr(staff, 'lifecycle_stage', None) == 'trainee':
            return Response({
                'error': 'trainee_blocked',
                'detail': 'Staff member is in Trainee stage and cannot be assigned patients until advancing to probation or active employee status.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not staff.is_active:
            return Response({
                'error': 'inactive_staff',
                'detail': 'Cannot assign patients to an inactive staff member.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Disallow non-clinical roles
        if staff.role in ('accountant', 'crm_executive', 'patient_family', 'delivery_rider'):
            return Response({
                'error': 'non_clinical_role',
                'detail': f"Staff role '{staff.role}' cannot be assigned patients."
            }, status=status.HTTP_400_BAD_REQUEST)

        patient_id = request.data.get('patient_id')
        if not patient_id:
            return Response({'error': 'patient_id_required', 'detail': 'patient_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            patient = Patient.objects.get(pk=patient_id)
        except Patient.DoesNotExist:
            return Response({'error': 'patient_not_found', 'detail': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

        assignment_type = request.data.get('assignment_type', 'primary') # 'primary' or 'buddy'
        booking_id = request.data.get('booking_id')
        start_time_str = request.data.get('start_time')
        end_time_str = request.data.get('end_time')
        notes = request.data.get('notes', '')

        # 1. Care Manager Assignment -> Patient.assigned_care_manager
        if staff.role == 'care_manager':
            patient.assigned_care_manager = staff
            patient.save(update_fields=['assigned_care_manager'])
            log_staff_audit(actor, 'assign_patient', staff, {
                'patient_id': patient.id,
                'patient_name': patient.full_name,
                'model': 'Patient.assigned_care_manager'
            }, request=request)
            return Response({
                'success': True,
                'message': f"{staff.full_name} assigned as Care Manager to {patient.full_name}.",
                'model': 'Patient.assigned_care_manager',
            })

        # 2. Doctor Assignment -> Booking with service_type='Doctor Consultation' (fulfilling treating-doctor relationship)
        if staff.role == 'doctor':
            if booking_id:
                try:
                    booking = Booking.objects.get(pk=booking_id, patient=patient)
                    booking.assigned_staff = staff
                    booking.status = BookingStatus.ASSIGNED
                    booking.save(update_fields=['assigned_staff', 'status'])
                except Booking.DoesNotExist:
                    return Response({'error': 'booking_not_found', 'detail': 'Booking not found for this patient.'}, status=status.HTTP_404_NOT_FOUND)
            else:
                now = timezone.now()
                booking = Booking.objects.create(
                    patient=patient,
                    assigned_staff=staff,
                    service_type='Doctor Consultation',
                    scheduled_time=now,
                    shift_end_time=now + timezone.timedelta(hours=1),
                    status=BookingStatus.ASSIGNED,
                    notes=notes or f"Assigned treating doctor: {staff.full_name}"
                )
            log_staff_audit(actor, 'assign_patient', staff, {
                'patient_id': patient.id,
                'patient_name': patient.full_name,
                'model': 'Booking',
                'booking_id': booking.id,
                'service_type': 'Doctor Consultation',
            }, request=request)
            return Response({
                'success': True,
                'message': f"Dr. {staff.full_name} assigned to {patient.full_name}.",
                'model': 'Booking',
                'booking_id': booking.id,
            })

        # 3. Nurse & Therapists -> Booking assigned_staff or buddy
        if booking_id:
            try:
                booking = Booking.objects.get(pk=booking_id, patient=patient)
                if assignment_type == 'buddy':
                    booking.buddy = staff
                    booking.buddy_staff = staff
                    booking.save(update_fields=['buddy', 'buddy_staff'])
                else:
                    booking.assigned_staff = staff
                    booking.status = BookingStatus.ASSIGNED
                    booking.save(update_fields=['assigned_staff', 'status'])
            except Booking.DoesNotExist:
                return Response({'error': 'booking_not_found', 'detail': 'Booking not found for this patient.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            now = timezone.now()
            hours = 8 if staff.role == 'nurse' else 2
            booking = Booking.objects.create(
                patient=patient,
                assigned_staff=staff if assignment_type != 'buddy' else None,
                buddy=staff if assignment_type == 'buddy' else None,
                buddy_staff=staff if assignment_type == 'buddy' else None,
                service_type=f"{staff.get_role_display()} Visit",
                scheduled_time=now,
                shift_end_time=now + timezone.timedelta(hours=hours),
                status=BookingStatus.ASSIGNED,
                notes=notes or f"Assigned {assignment_type}: {staff.full_name}"
            )

        log_staff_audit(actor, 'assign_patient', staff, {
            'patient_id': patient.id,
            'patient_name': patient.full_name,
            'model': 'Booking',
            'booking_id': booking.id,
            'assignment_type': assignment_type,
        }, request=request)

        return Response({
            'success': True,
            'message': f"{staff.full_name} assigned ({assignment_type}) to {patient.full_name}.",
            'model': 'Booking',
            'booking_id': booking.id,
        })

    @action(detail=True, methods=['post'], url_path='unassign-patient')
    def unassign_patient(self, request, pk=None):
        staff = self.get_object()
        actor = request.user
        actor_role = get_user_role(actor)

        if actor_role not in ('super_admin', 'admin') and not getattr(actor, 'is_superuser', False):
            return Response({'detail': 'You do not have permission to unassign patients.'}, status=status.HTTP_403_FORBIDDEN)

        patient_id = request.data.get('patient_id')
        booking_id = request.data.get('booking_id')
        if not patient_id:
            return Response({'error': 'patient_id_required', 'detail': 'patient_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            patient = Patient.objects.get(pk=patient_id)
        except Patient.DoesNotExist:
            return Response({'error': 'patient_not_found', 'detail': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

        if staff.role == 'care_manager' and patient.assigned_care_manager_id == staff.id:
            patient.assigned_care_manager = None
            patient.save(update_fields=['assigned_care_manager'])
        else:
            b_qs = Booking.objects.filter(patient=patient)
            if booking_id:
                b_qs = b_qs.filter(id=booking_id)
            else:
                b_qs = b_qs.filter(Q(assigned_staff=staff) | Q(buddy=staff))
            for b in b_qs:
                if b.assigned_staff_id == staff.id:
                    b.assigned_staff = None
                if b.buddy_id == staff.id:
                    b.buddy = None
                    b.buddy_staff = None
                b.save(update_fields=['assigned_staff', 'buddy', 'buddy_staff'])

        log_staff_audit(actor, 'unassign_patient', staff, {'patient_id': patient.id, 'patient_name': patient.full_name}, request=request)
        return Response({'success': True, 'message': f'Unassigned {staff.full_name} from {patient.full_name}.'})

    @action(detail=True, methods=['get'])
    def profile(self, request, pk=None):
        staff = self.get_object()
        actor = request.user
        role = get_user_role(actor)

        is_admin_or_super = role in ('super_admin', 'admin') or getattr(actor, 'is_superuser', False)
        is_self = (staff.user_id and staff.user_id == actor.id)
        if not (is_admin_or_super or is_self or role in ('branch_manager', 'care_manager')):
            return Response({'detail': 'You do not have permission to view this staff profile.'}, status=status.HTTP_403_FORBIDDEN)

        staff_data = StaffDetailSerializer(staff, context={'request': request}).data

        # 1. Stage history
        events = StaffStageEvent.objects.filter(staff=staff).order_by('-created_at')
        from .lifecycle_serializers import StaffStageEventSerializer
        events_data = StaffStageEventSerializer(events, many=True).data

        # 2. Assigned patients
        managed_pts = Patient.objects.filter(assigned_care_manager=staff).values('id', 'first_name', 'last_name', 'mr_number', 'phone', 'is_active', 'primary_diagnosis')
        staff_bookings = Booking.objects.filter(
            Q(assigned_staff=staff) | Q(buddy=staff)
        ).select_related('patient').order_by('-scheduled_time')[:50]

        assigned_patients = []
        for mp in managed_pts:
            assigned_patients.append({
                'patient_id': mp['id'],
                'patient_name': f"{mp['first_name']} {mp['last_name']}".strip(),
                'mr_number': mp['mr_number'],
                'relationship': 'Care Manager',
                'status': 'active' if mp['is_active'] else 'inactive',
                'diagnosis': mp['primary_diagnosis'] or '',
                'date': None,
            })
        for b in staff_bookings:
            if not b.patient:
                continue
            assigned_patients.append({
                'booking_id': b.id,
                'patient_id': b.patient_id,
                'patient_name': b.patient.full_name,
                'mr_number': b.patient.mr_number,
                'relationship': 'Buddy' if b.buddy_id == staff.id else 'Primary Clinician',
                'service_type': b.service_type,
                'scheduled_time': b.scheduled_time.isoformat() if b.scheduled_time else None,
                'status': b.status,
                'diagnosis': b.patient.primary_diagnosis or '',
            })

        # 3. Published Duties
        duties = RosterAssignment.objects.filter(
            staff=staff, is_published=True
        ).prefetch_related('patients').order_by('-date')[:30]
        duties_data = []
        for d in duties:
            duties_data.append({
                'id': d.id,
                'date': d.date.isoformat(),
                'shift_name': d.shift_name,
                'start_time': d.start_time.strftime('%H:%M') if d.start_time else '08:00',
                'end_time': d.end_time.strftime('%H:%M') if d.end_time else '16:00',
                'is_off': d.is_off,
                'patients': [{'id': p.id, 'name': p.full_name} for p in d.patients.all()],
            })

        # 4. Onboarding Checklist
        from .lifecycle_views import StaffOnboardingSummaryView
        onboarding_data = None
        if is_admin_or_super or is_self or role == 'branch_manager':
            onboarding_res = StaffOnboardingSummaryView().get(request, pk=staff.id)
            if onboarding_res.status_code == 200:
                onboarding_data = onboarding_res.data

        # 5. Attendance & Leave
        attendance_records = staff.attendance_records.order_by('-date')[:30]
        leave_records = staff.leave_requests.order_by('-created_at')[:20]
        attendance_data = AttendanceRecordSerializer(attendance_records, many=True).data
        leave_data = LeaveRequestSerializer(leave_records, many=True).data

        # 6. Activity logs
        target_username = getattr(staff.user, 'username', '') if staff.user else ''
        activity_logs = AuditLog.objects.filter(
            Q(target_user=target_username) | Q(details__contains=f'"staff_id": {staff.id}')
        ).order_by('-timestamp')[:30]
        activity_data = []
        for a in activity_logs:
            activity_data.append({
                'id': a.id,
                'action': a.action,
                'actor_name': a.actor_name,
                'timestamp': a.timestamp.isoformat(),
                'details': a.details,
            })

        # 7. Commitments counts
        today = timezone.now().date()
        active_duties_count = staff.roster_assignments.filter(date__gte=today, is_published=True, is_off=False).count()
        active_bookings_count = Booking.objects.filter(
            Q(assigned_staff=staff) | Q(buddy=staff),
            scheduled_time__gte=timezone.now(),
            status__in=[BookingStatus.ASSIGNED, BookingStatus.IN_PROGRESS, BookingStatus.PENDING]
        ).count()

        return Response({
            'staff': staff_data,
            'stage_events': events_data,
            'assigned_patients': assigned_patients,
            'duties': duties_data,
            'onboarding': onboarding_data,
            'attendance': attendance_data,
            'leave': leave_data,
            'activity_logs': activity_data,
            'active_duties_count': active_duties_count,
            'active_bookings_count': active_bookings_count,
        })

    @action(detail=False, methods=['get'])
    def available(self, request):
        """Staff members currently available for assignment."""
        qs = self.get_queryset().filter(is_active=True, status='available')
        return Response(StaffListSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def on_visit(self, request):
        """Staff currently on a visit (for live tracking)."""
        qs = self.get_queryset().filter(is_active=True, status='on_visit')
        return Response(StaffListSerializer(qs, many=True).data)

    @action(detail=True, methods=['get'])
    def attendance(self, request, pk=None):
        staff = self.get_object()
        records = staff.attendance_records.all()[:60]
        return Response(AttendanceRecordSerializer(records, many=True).data)

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        staff = self.get_object()
        if not staff.user:
            return Response({'error': 'This staff member has no linked login account.'}, status=400)
        password = request.data.get('password')
        password_confirm = request.data.get('password_confirm')
        if not password or len(password) < 8:
            return Response({'password': ['Password must be at least 8 characters long.']}, status=400)
        if password != password_confirm:
            return Response({'password_confirm': ['Passwords do not match.']}, status=400)
        staff.user.set_password(password)
        staff.user.save()
        return Response({'success': True, 'message': f'Password updated successfully for {staff.user.username}.'})

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        staff = self.get_object()
        staff.is_active = not staff.is_active
        staff.save(update_fields=['is_active'])
        if staff.user:
            staff.user.is_active = staff.is_active
            staff.user.save(update_fields=['is_active'])
        return Response(StaffListSerializer(staff).data)

    @action(detail=True, methods=['get'], url_path='onboarding')
    def onboarding(self, request, pk=None):
        from .lifecycle_views import StaffOnboardingSummaryView
        return StaffOnboardingSummaryView().get(request, pk=pk)

    @action(detail=True, methods=['post'], url_path='regenerate-code')
    def regenerate_code(self, request, pk=None):
        from .lifecycle_views import StaffRegenerateCodeView
        return StaffRegenerateCodeView().post(request, pk=pk)

    @action(detail=True, methods=['post'], url_path='stage/advance')
    def stage_advance(self, request, pk=None):
        from .lifecycle_views import StaffStageAdvanceView
        return StaffStageAdvanceView().post(request, pk=pk)

    @action(detail=True, methods=['post'], url_path='stage/return')
    def stage_return(self, request, pk=None):
        from .lifecycle_views import StaffStageReturnView
        return StaffStageReturnView().post(request, pk=pk)


class LeaveRequestViewSet(viewsets.ModelViewSet):
    queryset = LeaveRequest.objects.select_related('staff').all()
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'], permission_classes=[IsCareManagerOrAdmin])
    def approve(self, request, pk=None):
        leave = self.get_object()
        leave.status = 'approved'
        leave.reviewed_by = request.user
        leave.save(update_fields=['status', 'reviewed_by'])

        # Notify the requesting staff member
        if leave.staff.user:
            from notifications.views import create_notification
            create_notification(
                recipient_user=leave.staff.user,
                message=(
                    f'✅ Your {leave.get_leave_type_display()} request '
                    f'({leave.start_date} – {leave.end_date}) has been approved.'
                ),
                icon_key='check_circle',
                target_screen='Profile',
                target_params={'leave_id': leave.pk},
            )

        return Response(LeaveRequestSerializer(leave).data)

    @action(detail=True, methods=['post'], permission_classes=[IsCareManagerOrAdmin])
    def reject(self, request, pk=None):
        leave = self.get_object()
        leave.status = 'rejected'
        leave.reviewed_by = request.user
        leave.save(update_fields=['status', 'reviewed_by'])

        # Notify the requesting staff member
        if leave.staff.user:
            from notifications.views import create_notification
            create_notification(
                recipient_user=leave.staff.user,
                message=(
                    f'❌ Your {leave.get_leave_type_display()} request '
                    f'({leave.start_date} – {leave.end_date}) has been rejected. '
                    'Please contact your manager for details.'
                ),
                icon_key='x_circle',
                target_screen='Profile',
                target_params={'leave_id': leave.pk},
            )

        return Response(LeaveRequestSerializer(leave).data)


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = AttendanceRecord.objects.select_related('staff').all()
    serializer_class = AttendanceRecordSerializer
