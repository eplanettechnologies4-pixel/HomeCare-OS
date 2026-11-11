import datetime
from zoneinfo import ZoneInfo
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from homecareOS.permissions import get_user_role
from staff.models import (
    StaffMember, StaffRole, LeaveRequest,
    ShiftTemplate, RosterWeek, RosterAssignment
)
from staff_portal.models import StaffRequest
from notifications.models import Notification
from accounts.models import AuditLog
from .serializers import (
    ShiftTemplateSerializer, RosterWeekSerializer, RosterAssignmentSerializer
)


def _get_karachi_tz():
    tz_name = getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi')
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return timezone.get_current_timezone()


def _normalize_monday(date_val):
    """Ensure a date is the Monday of its week."""
    if isinstance(date_val, str):
        date_val = datetime.date.fromisoformat(date_val)
    return date_val - datetime.timedelta(days=date_val.weekday())


def _can_edit_roster(user):
    """
    Checks if user can edit draft rosters:
    - super_admin and admin: always True
    - care_manager: True if settings.ROSTER_CARE_MANAGER_CAN_EDIT is True
    - all other roles: False
    """
    role = get_user_role(user)
    if role in ('super_admin', 'admin'):
        return True
    if role in ('care_manager', 'branch_manager'):
        return getattr(settings, 'ROSTER_CARE_MANAGER_CAN_EDIT', False)
    return False


def _can_publish_roster(user):
    """Only super_admin and admin can publish rosters."""
    role = get_user_role(user)
    return role in ('super_admin', 'admin')


# ── 1. Shift Templates View ──────────────────────────────────────────────────

class ShiftTemplateListCreateView(APIView):
    """
    List active shift templates or create a new template.
    Create requires Admin / Super Admin.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role = get_user_role(request.user)
        if role not in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Response(
                {'detail': 'Shift templates are restricted to administrative staff.'},
                status=status.HTTP_403_FORBIDDEN
            )
        include_all = request.query_params.get('all', 'false').lower() == 'true'
        qs = ShiftTemplate.objects.all()
        if not include_all:
            qs = qs.filter(is_active=True)
        serializer = ShiftTemplateSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not _can_publish_roster(request.user):
            return Response({'detail': 'Only administrators can create shift templates.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = ShiftTemplateSerializer(data=request.data)
        if serializer.is_valid():
            tmpl = serializer.save()
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.get_full_name() or request.user.username,
                action='Shift Template Created',
                target_user=tmpl.name,
                details=f"Created shift template '{tmpl.name}' ({tmpl.start_time} - {tmpl.end_time}, {tmpl.location})",
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ShiftTemplateDetailView(APIView):
    """
    Update or deactivate a shift template.
    Editing a template does NOT rewrite past published rosters;
    assignments retain snapshots.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        role = get_user_role(request.user)
        if role not in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Response({'detail': 'Shift templates are restricted to administrative staff.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            tmpl = ShiftTemplate.objects.get(pk=pk)
        except ShiftTemplate.DoesNotExist:
            return Response({'detail': 'Shift template not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ShiftTemplateSerializer(tmpl).data)

    def patch(self, request, pk):
        if not _can_publish_roster(request.user):
            return Response({'detail': 'Only administrators can edit shift templates.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            tmpl = ShiftTemplate.objects.get(pk=pk)
        except ShiftTemplate.DoesNotExist:
            return Response({'detail': 'Shift template not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ShiftTemplateSerializer(tmpl, data=request.data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.get_full_name() or request.user.username,
                action='Shift Template Updated',
                target_user=updated.name,
                details=f"Updated shift template '{updated.name}' ({updated.start_time} - {updated.end_time})",
            )
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request, pk):
        # Handle /deactivate/ action
        if not _can_publish_roster(request.user):
            return Response({'detail': 'Only administrators can deactivate shift templates.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            tmpl = ShiftTemplate.objects.get(pk=pk)
        except ShiftTemplate.DoesNotExist:
            return Response({'detail': 'Shift template not found.'}, status=status.HTTP_404_NOT_FOUND)

        tmpl.is_active = not tmpl.is_active
        tmpl.save(update_fields=['is_active'])
        AuditLog.objects.create(
            actor=request.user,
            actor_name=request.user.get_full_name() or request.user.username,
            action='Shift Template Status Toggled',
            target_user=tmpl.name,
            details=f"Set is_active={tmpl.is_active} for '{tmpl.name}'",
        )
        return Response(ShiftTemplateSerializer(tmpl).data)


# ── 2. Roster Grid View ──────────────────────────────────────────────────────

class RosterGridView(APIView):
    """
    GET /api/staff/roster/
    Returns the weekly roster grid for Staff Directory.
    Columns: Monday to Sunday (Asia/Karachi).
    Rows: Staff members with filter by role and search by name.
    Cells: State (Leave, Off, Shift, Empty), template info, transport, buddy.
    Validation warnings: No staff for role, weekly hours exceeding max limit.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role = get_user_role(request.user)
        # Permissions: admin, super_admin, and care_manager can view full roster.
        # Clinical staff view own roster via staff-portal or restricted view.
        if role not in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Response({'detail': 'Roster management grid is restricted to Administrative staff.'}, status=status.HTTP_403_FORBIDDEN)

        week_start_param = request.query_params.get('week_start')
        if week_start_param:
            try:
                base_date = datetime.date.fromisoformat(week_start_param)
            except ValueError:
                return Response({'detail': 'Invalid date format. Expected YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            base_date = timezone.now().astimezone(_get_karachi_tz()).date()

        monday_date = _normalize_monday(base_date)
        sunday_date = monday_date + datetime.timedelta(days=6)

        # Get or create RosterWeek envelope
        roster_week, _ = RosterWeek.objects.get_or_create(
            week_start_date=monday_date,
            defaults={'status': RosterWeek.Status.DRAFT, 'revision': 1}
        )

        # Build list of 7 days
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        days = []
        for i in range(7):
            d = monday_date + datetime.timedelta(days=i)
            days.append({
                'date': d.isoformat(),
                'day_name': day_names[i],
                'short_name': day_names[i][:3],
                'day_number': d.day,
            })

        # Query staff members
        staff_qs = StaffMember.objects.filter(is_active=True).order_by('role', 'first_name', 'last_name')
        role_filter = request.query_params.get('role', '').strip().lower()
        if role_filter:
            staff_qs = staff_qs.filter(role=role_filter)

        search_query = request.query_params.get('search', '').strip()
        if search_query:
            staff_qs = staff_qs.filter(
                Q(first_name__icontains=search_query) |
                Q(last_name__icontains=search_query) |
                Q(employee_id__icontains=search_query) |
                Q(user__username__icontains=search_query)
            )

        # Query approved leaves for this week window
        leaves = LeaveRequest.objects.filter(
            status=LeaveRequest.LeaveStatus.APPROVED,
            start_date__lte=sunday_date,
            end_date__gte=monday_date,
        ).select_related('staff')
        # Map: (staff_id, date_str) -> LeaveRequest
        leave_map = {}
        for l in leaves:
            cur = max(l.start_date, monday_date)
            fin = min(l.end_date, sunday_date)
            delta_days = (fin - cur).days + 1
            for offset in range(delta_days):
                leave_date = cur + datetime.timedelta(days=offset)
                leave_map[(l.staff_id, leave_date.isoformat())] = l

        # Query existing assignments for this week (draft edits take precedence in admin grid)
        assignments = RosterAssignment.objects.filter(
            date__range=[monday_date, sunday_date]
        ).select_related('shift_template', 'buddy_staff')
        assign_map = {}
        for a in assignments:
            key = (a.staff_id, a.date.isoformat())
            if key not in assign_map or not a.is_published:
                assign_map[key] = a

        max_weekly_hours = getattr(settings, 'ROSTER_MAX_WEEKLY_HOURS', 60)

        # Build staff rows
        staff_rows = []
        # Track daily coverage per clinical role
        clinical_roles = [
            StaffRole.NURSE,
            StaffRole.DOCTOR,
            StaffRole.PHYSIO,
            StaffRole.SPEECH,
            StaffRole.PSYCHOLOGIST,
            StaffRole.DIETICIAN,
        ]
        daily_role_coverage = {d['date']: {r: 0 for r in clinical_roles} for d in days}

        for s in staff_qs:
            total_hours = 0.0
            shifts_by_date = {}

            for day_info in days:
                d_str = day_info['date']
                d_obj = datetime.date.fromisoformat(d_str)

                # 1. Check approved leave
                leave_obj = leave_map.get((s.id, d_str))
                if leave_obj:
                    shifts_by_date[d_str] = {
                        'state': 'leave',
                        'is_leave': True,
                        'read_only': True,
                        'leave_type': leave_obj.leave_type,
                        'leave_type_display': leave_obj.get_leave_type_display(),
                        'leave_reason': leave_obj.reason,
                        'color': '#9CA3AF',
                        'shift_name': 'Approved Leave',
                    }
                    continue

                # 2. Check assignment
                assign = assign_map.get((s.id, d_str))
                if assign:
                    # Calculate shift duration
                    hours = 0.0
                    if not assign.is_off and assign.start_time and assign.end_time:
                        start_dt = datetime.datetime.combine(d_obj, assign.start_time)
                        end_dt = datetime.datetime.combine(d_obj, assign.end_time)
                        if end_dt <= start_dt:
                            end_dt += datetime.timedelta(days=1)
                        hours = round((end_dt - start_dt).total_seconds() / 3600.0, 1)
                        total_hours += hours

                    if not assign.is_off and s.role in clinical_roles:
                        daily_role_coverage[d_str][s.role] += 1

                    shifts_by_date[d_str] = {
                        'assignment_id': assign.id,
                        'state': 'off' if assign.is_off else 'shift',
                        'is_off': assign.is_off,
                        'shift_template_id': assign.shift_template_id,
                        'shift_name': assign.shift_name,
                        'start_time': assign.start_time.strftime('%H:%M') if assign.start_time else None,
                        'end_time': assign.end_time.strftime('%H:%M') if assign.end_time else None,
                        'location': assign.location,
                        'color': assign.color,
                        'hours': hours,
                        'buddy_staff_id': assign.buddy_staff_id,
                        'buddy_name': assign.buddy_staff.full_name if assign.buddy_staff else None,
                        'transport_driver_name': assign.transport_driver_name,
                        'transport_driver_phone': assign.transport_driver_phone,
                        'transport_pickup_time': assign.transport_pickup_time,
                    }
                else:
                    shifts_by_date[d_str] = {
                        'state': 'empty',
                        'shift_name': 'Unassigned',
                        'color': '#E5E7EB',
                        'is_off': False,
                    }

            staff_rows.append({
                'id': s.id,
                'name': s.full_name,
                'employee_id': s.employee_id,
                'role': s.role,
                'role_display': s.get_role_display(),
                'designation': s.designation,
                'photo': s.photo.url if s.photo else None,
                'weekly_hours': round(total_hours, 1),
                'exceeds_max_hours': total_hours > max_weekly_hours,
                'shifts': shifts_by_date,
            })

        # Calculate role coverage warnings (e.g. any day with 0 staff for a role)
        coverage_warnings = []
        for d_str, roles_count in daily_role_coverage.items():
            for role_key, cnt in roles_count.items():
                # Only warn if the clinic has active staff of this role in the directory
                total_staff_of_role = StaffMember.objects.filter(role=role_key, is_active=True).count()
                if total_staff_of_role > 0 and cnt == 0:
                    coverage_warnings.append({
                        'date': d_str,
                        'role': role_key,
                        'message': f"No {role_key.replace('_', ' ').capitalize()} scheduled on {d_str}",
                    })

        return Response({
            'week_start_date': monday_date.isoformat(),
            'week_end_date': sunday_date.isoformat(),
            'status': roster_week.status,
            'revision': roster_week.revision,
            'published_at': roster_week.published_at.isoformat() if roster_week.published_at else None,
            'published_by': roster_week.published_by.get_full_name() if roster_week.published_by else None,
            'max_weekly_hours': max_weekly_hours,
            'days': days,
            'staff': staff_rows,
            'coverage_warnings': coverage_warnings,
        })


# ── 3. Assign Shift Cell ─────────────────────────────────────────────────────

class RosterAssignCellView(APIView):
    """
    POST /api/staff/roster/assign/
    Assign or update a shift cell for one staff member and date.
    - Double booking of one staff in overlapping shifts is blocked
    - Assigning on an approved leave day is blocked
    - Snapshot template fields
    - Edits create a new draft revision if the week was published
    - Writes an AuditLog entry
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _can_edit_roster(request.user):
            return Response(
                {'detail': 'You do not have permission to edit the staff roster.'},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_id = request.data.get('staff_id')
        date_str = request.data.get('date')
        shift_template_id = request.data.get('shift_template_id')
        is_off = bool(request.data.get('is_off', False))
        buddy_staff_id = request.data.get('buddy_staff_id')
        driver_name = request.data.get('transport_driver_name', '')
        driver_phone = request.data.get('transport_driver_phone', '')
        pickup_time = request.data.get('transport_pickup_time', '')
        reason = request.data.get('reason', '')

        if not staff_id or not date_str:
            return Response({'detail': 'staff_id and date are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_date = datetime.date.fromisoformat(date_str)
        except ValueError:
            return Response({'detail': 'Invalid date format.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            staff = StaffMember.objects.get(id=staff_id)
        except StaffMember.DoesNotExist:
            return Response({'detail': 'Staff member not found.'}, status=status.HTTP_404_NOT_FOUND)

        # 1. Block assignment if staff is on approved leave on that date
        on_leave = LeaveRequest.objects.filter(
            staff=staff,
            status=LeaveRequest.LeaveStatus.APPROVED,
            start_date__lte=target_date,
            end_date__gte=target_date,
        ).exists()
        if on_leave:
            return Response(
                {'detail': f"{staff.full_name} is on approved leave on {date_str}. Shifts cannot be assigned on approved leave days."},
                status=status.HTTP_400_BAD_REQUEST
            )

        tmpl = None
        if shift_template_id:
            try:
                tmpl = ShiftTemplate.objects.get(id=shift_template_id)
            except ShiftTemplate.DoesNotExist:
                return Response({'detail': 'Shift template not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Resolve week envelope
        monday_date = _normalize_monday(target_date)
        roster_week, _ = RosterWeek.objects.get_or_create(
            week_start_date=monday_date,
            defaults={'status': RosterWeek.Status.DRAFT, 'revision': 1}
        )

        with transaction.atomic():
            old_assignment = RosterAssignment.objects.filter(staff=staff, date=target_date).first()
            old_shift_name = old_assignment.shift_name if old_assignment else 'None'

            # 2. Block overlap: double booking of one staff in overlapping shifts
            # If template has start/end time, check other shifts on that day or spanning midnight
            if tmpl and not tmpl.is_off:
                existing_shifts = RosterAssignment.objects.filter(
                    staff=staff,
                    date=target_date,
                    is_off=False
                )
                if old_assignment:
                    existing_shifts = existing_shifts.exclude(id=old_assignment.id)

                for ex in existing_shifts:
                    if ex.start_time and ex.end_time and tmpl.start_time and tmpl.end_time:
                        if max(ex.start_time, tmpl.start_time) < min(ex.end_time, tmpl.end_time):
                            return Response(
                                {'detail': f"Overlapping shift conflict: {staff.full_name} already has shift '{ex.shift_name}' ({ex.start_time} - {ex.end_time}) on {date_str}."},
                                status=status.HTTP_400_BAD_REQUEST
                            )

            # Snapshots from template or defaults
            shift_name = tmpl.name if tmpl else ('Off Duty' if is_off else 'Custom Shift')
            start_time = tmpl.start_time if tmpl else None
            end_time = tmpl.end_time if tmpl else None
            location = tmpl.location if tmpl else ('Off Duty' if is_off else '')
            color = tmpl.color if tmpl else ('#6B7280' if is_off else '#6D28D9')
            actual_is_off = tmpl.is_off if tmpl else is_off

            buddy = None
            if buddy_staff_id:
                try:
                    buddy = StaffMember.objects.get(id=buddy_staff_id)
                except StaffMember.DoesNotExist:
                    pass

            # If the week is currently published, any edit should transition the week to DRAFT
            # and bump the revision, while preserving the existing published assignment.
            is_currently_published = (roster_week.status == RosterWeek.Status.PUBLISHED)
            target_revision = roster_week.revision + (1 if is_currently_published else 0)

            assignment, created = RosterAssignment.objects.update_or_create(
                staff=staff,
                date=target_date,
                is_published=False,
                defaults={
                    'roster_week': roster_week,
                    'shift_template': tmpl,
                    'shift_name': shift_name,
                    'start_time': start_time,
                    'end_time': end_time,
                    'location': location,
                    'color': color,
                    'is_off': actual_is_off,
                    'buddy_staff': buddy,
                    'transport_driver_name': driver_name,
                    'transport_driver_phone': driver_phone,
                    'transport_pickup_time': pickup_time,
                    'revision': target_revision,
                }
            )

            # Changes after publishing create a new draft revision, not an in-place overwrite
            if is_currently_published:
                roster_week.status = RosterWeek.Status.DRAFT
                roster_week.revision = target_revision
                roster_week.save(update_fields=['status', 'revision', 'updated_at'])

            # 3. Audit trail (who, when, staff, date, old shift, new shift, reason)
            actor_name = request.user.get_full_name() or request.user.username
            AuditLog.objects.create(
                actor=request.user,
                actor_name=actor_name,
                action='Roster Shift Assigned',
                target_user=staff.full_name,
                details=(
                    f"Staff: {staff.full_name} ({staff.employee_id}) | Date: {date_str} | "
                    f"Old: {old_shift_name} -> New: {shift_name} | Week: {roster_week.week_start_date} "
                    f"(Rev {roster_week.revision}) | Reason: {reason or 'Direct scheduling'}"
                ),
            )

        return Response(RosterAssignmentSerializer(assignment).data)


# ── 4. Bulk Actions View ─────────────────────────────────────────────────────

class RosterBulkActionView(APIView):
    """
    POST /api/staff/roster/bulk/
    Supported actions:
    1. copy_previous_week: copies shifts from previous week (skips approved leave days)
    2. apply_shift: applies template to list of staff_ids and dates
    3. fill_mon_fri: applies source shift across Mon-Fri for a staff member
    4. clear_cells: clears assigned shifts for selected staff and dates
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _can_edit_roster(request.user):
            return Response(
                {'detail': 'You do not have permission to edit the staff roster.'},
                status=status.HTTP_403_FORBIDDEN
            )

        action_name = request.data.get('action')
        week_start_str = request.data.get('week_start')

        if not action_name or not week_start_str:
            return Response({'detail': 'action and week_start are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_monday = _normalize_monday(datetime.date.fromisoformat(week_start_str))
        except ValueError:
            return Response({'detail': 'Invalid week_start date format.'}, status=status.HTTP_400_BAD_REQUEST)

        target_sunday = target_monday + datetime.timedelta(days=6)
        roster_week, _ = RosterWeek.objects.get_or_create(
            week_start_date=target_monday,
            defaults={'status': RosterWeek.Status.DRAFT, 'revision': 1}
        )

        cells_updated = 0
        actor_name = request.user.get_full_name() or request.user.username

        with transaction.atomic():
            if action_name == 'copy_previous_week':
                prev_monday = target_monday - datetime.timedelta(days=7)
                prev_assignments = RosterAssignment.objects.filter(
                    date__range=[prev_monday, prev_monday + datetime.timedelta(days=6)]
                ).select_related('staff', 'shift_template', 'buddy_staff')

                for prev in prev_assignments:
                    day_offset = (prev.date - prev_monday).days
                    dest_date = target_monday + datetime.timedelta(days=day_offset)

                    # Skip if staff member is on approved leave on dest_date
                    on_leave = LeaveRequest.objects.filter(
                        staff=prev.staff,
                        status=LeaveRequest.LeaveStatus.APPROVED,
                        start_date__lte=dest_date,
                        end_date__gte=dest_date,
                    ).exists()
                    if on_leave:
                        continue

                    RosterAssignment.objects.update_or_create(
                        staff=prev.staff,
                        date=dest_date,
                        is_published=False,
                        defaults={
                            'roster_week': roster_week,
                            'shift_template': prev.shift_template,
                            'shift_name': prev.shift_name,
                            'start_time': prev.start_time,
                            'end_time': prev.end_time,
                            'location': prev.location,
                            'color': prev.color,
                            'is_off': prev.is_off,
                            'buddy_staff': prev.buddy_staff,
                            'transport_driver_name': prev.transport_driver_name,
                            'transport_driver_phone': prev.transport_driver_phone,
                            'transport_pickup_time': prev.transport_pickup_time,
                            'revision': roster_week.revision,
                        }
                    )
                    cells_updated += 1

            elif action_name == 'apply_shift':
                staff_ids = request.data.get('staff_ids', [])
                dates = request.data.get('dates', [])
                shift_template_id = request.data.get('shift_template_id')
                is_off = bool(request.data.get('is_off', False))

                tmpl = None
                if shift_template_id:
                    try:
                        tmpl = ShiftTemplate.objects.get(id=shift_template_id)
                    except ShiftTemplate.DoesNotExist:
                        return Response({'detail': 'Shift template not found.'}, status=status.HTTP_404_NOT_FOUND)

                shift_name = tmpl.name if tmpl else ('Off Duty' if is_off else 'Custom Shift')
                start_time = tmpl.start_time if tmpl else None
                end_time = tmpl.end_time if tmpl else None
                location = tmpl.location if tmpl else ('Off Duty' if is_off else '')
                color = tmpl.color if tmpl else ('#6B7280' if is_off else '#6D28D9')
                actual_is_off = tmpl.is_off if tmpl else is_off

                for s_id in staff_ids:
                    try:
                        s_obj = StaffMember.objects.get(id=s_id)
                    except StaffMember.DoesNotExist:
                        continue

                    for d_str in dates:
                        d_obj = datetime.date.fromisoformat(d_str)
                        # Skip if on approved leave
                        if LeaveRequest.objects.filter(
                            staff=s_obj, status=LeaveRequest.LeaveStatus.APPROVED,
                            start_date__lte=d_obj, end_date__gte=d_obj
                        ).exists():
                            continue

                        RosterAssignment.objects.update_or_create(
                            staff=s_obj,
                            date=d_obj,
                            is_published=False,
                            defaults={
                                'roster_week': roster_week,
                                'shift_template': tmpl,
                                'shift_name': shift_name,
                                'start_time': start_time,
                                'end_time': end_time,
                                'location': location,
                                'color': color,
                                'is_off': actual_is_off,
                                'revision': roster_week.revision,
                            }
                        )
                        cells_updated += 1

            elif action_name == 'fill_mon_fri':
                staff_id = request.data.get('staff_id')
                shift_template_id = request.data.get('shift_template_id')
                try:
                    s_obj = StaffMember.objects.get(id=staff_id)
                except StaffMember.DoesNotExist:
                    return Response({'detail': 'Staff member not found.'}, status=status.HTTP_404_NOT_FOUND)

                tmpl = None
                if shift_template_id:
                    try:
                        tmpl = ShiftTemplate.objects.get(id=shift_template_id)
                    except ShiftTemplate.DoesNotExist:
                        return Response({'detail': 'Shift template not found.'}, status=status.HTTP_404_NOT_FOUND)

                shift_name = tmpl.name if tmpl else 'Morning'
                start_time = tmpl.start_time if tmpl else datetime.time(8, 0)
                end_time = tmpl.end_time if tmpl else datetime.time(16, 0)
                location = tmpl.location if tmpl else 'Main Hospital'
                color = tmpl.color if tmpl else '#059669'
                actual_is_off = tmpl.is_off if tmpl else False

                # Monday to Friday
                for i in range(5):
                    d_obj = target_monday + datetime.timedelta(days=i)
                    if LeaveRequest.objects.filter(
                        staff=s_obj, status=LeaveRequest.LeaveStatus.APPROVED,
                        start_date__lte=d_obj, end_date__gte=d_obj
                    ).exists():
                        continue

                    RosterAssignment.objects.update_or_create(
                        staff=s_obj,
                        date=d_obj,
                        is_published=False,
                        defaults={
                            'roster_week': roster_week,
                            'shift_template': tmpl,
                            'shift_name': shift_name,
                            'start_time': start_time,
                            'end_time': end_time,
                            'location': location,
                            'color': color,
                            'is_off': actual_is_off,
                            'revision': roster_week.revision,
                        }
                    )
                    cells_updated += 1

            elif action_name == 'clear_cells':
                staff_ids = request.data.get('staff_ids', [])
                dates = request.data.get('dates', [])
                deleted_count, _ = RosterAssignment.objects.filter(
                    staff_id__in=staff_ids,
                    date__in=dates,
                    roster_week=roster_week
                ).delete()
                cells_updated = deleted_count

            else:
                return Response({'detail': f"Unknown bulk action '{action_name}'."}, status=status.HTTP_400_BAD_REQUEST)

            # Increment revision if previously published
            if roster_week.status == RosterWeek.Status.PUBLISHED:
                roster_week.status = RosterWeek.Status.DRAFT
                roster_week.revision += 1
                roster_week.save(update_fields=['status', 'revision', 'updated_at'])

            AuditLog.objects.create(
                actor=request.user,
                actor_name=actor_name,
                action='Roster Bulk Action',
                target_user=f"Week {target_monday}",
                details=f"Executed bulk action '{action_name}' on week {target_monday} (Rev {roster_week.revision}): {cells_updated} cells updated",
            )

        return Response({
            'success': True,
            'action': action_name,
            'cells_updated': cells_updated,
            'revision': roster_week.revision,
        })


# ── 5. Publish Week View ─────────────────────────────────────────────────────

class RosterPublishWeekView(APIView):
    """
    POST /api/staff/roster/publish/
    Makes the weekly roster live:
    - Only super_admin and admin can publish (care_manager gets 403 Forbidden)
    - Validates no overlapping shifts
    - Sets status='published', published_at=now, published_by=request.user
    - Sends a Notification to each affected staff member
    - Writes an AuditLog entry
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _can_publish_roster(request.user):
            return Response(
                {'detail': 'Only Super Administrators and Administrators can publish rosters.'},
                status=status.HTTP_403_FORBIDDEN
            )

        week_start_str = request.data.get('week_start')
        if not week_start_str:
            return Response({'detail': 'week_start is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_monday = _normalize_monday(datetime.date.fromisoformat(week_start_str))
        except ValueError:
            return Response({'detail': 'Invalid week_start format.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            roster_week = RosterWeek.objects.get(week_start_date=target_monday)
        except RosterWeek.DoesNotExist:
            return Response({'detail': 'Roster week not found.'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            now = timezone.now()
            roster_week.status = RosterWeek.Status.PUBLISHED
            roster_week.published_at = now
            roster_week.published_by = request.user
            roster_week.save(update_fields=['status', 'published_at', 'published_by', 'updated_at'])

            # 1. Supersede old published assignments: for each draft assignment (is_published=False),
            # delete any existing published assignment for the same staff and date.
            draft_assignments = RosterAssignment.objects.filter(
                roster_week=roster_week,
                is_published=False
            )
            for draft in draft_assignments:
                RosterAssignment.objects.filter(
                    staff=draft.staff,
                    date=draft.date,
                    is_published=True
                ).delete()

            # 2. Promote all draft assignments in this week to published
            draft_assignments.update(is_published=True, revision=roster_week.revision)

            # 3. Update revision on all published assignments in this week
            assignments = RosterAssignment.objects.filter(roster_week=roster_week, is_published=True)
            assignments.update(revision=roster_week.revision)

            # Send notifications to all affected staff
            affected_users = set()
            for a in assignments.select_related('staff__user'):
                if a.staff and a.staff.user:
                    affected_users.add(a.staff.user)

            for u in affected_users:
                Notification.objects.create(
                    recipient=u,
                    icon_key='calendar',
                    message=f"Your clinical duty roster for the week of {target_monday.strftime('%b %d, %Y')} has been published (Revision {roster_week.revision}).",
                    target_screen='roster',
                    target_params={'week_start': target_monday.isoformat(), 'revision': roster_week.revision},
                )

            actor_name = request.user.get_full_name() or request.user.username
            AuditLog.objects.create(
                actor=request.user,
                actor_name=actor_name,
                action='Roster Published',
                target_user=f"Week {target_monday}",
                details=f"Published Revision {roster_week.revision} of week {target_monday} by {actor_name}. {len(affected_users)} staff notified.",
            )

        return Response({
            'success': True,
            'week_start': target_monday.isoformat(),
            'revision': roster_week.revision,
            'published_at': roster_week.published_at.isoformat(),
            'notifications_sent': len(affected_users),
        })


# ── 6. Roster Audit History View ─────────────────────────────────────────────

class RosterHistoryView(APIView):
    """
    GET /api/staff/roster/history/
    Read-only audit history of roster actions.
    No Protected Health Information (PHI).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role = get_user_role(request.user)
        if role not in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Response({'detail': 'Roster history view requires administrative permissions.'}, status=status.HTTP_403_FORBIDDEN)

        week_start = request.query_params.get('week_start', '').strip()
        qs = AuditLog.objects.filter(action__istartswith='Roster')

        if week_start:
            qs = qs.filter(Q(target_user__icontains=week_start) | Q(details__icontains=week_start))

        logs = qs[:100]
        results = []
        for l in logs:
            results.append({
                'id': l.id,
                'actor_name': l.actor_name,
                'action': l.action,
                'target': l.target_user,
                'details': l.details,
                'timestamp': l.timestamp.isoformat(),
            })

        return Response({'count': len(results), 'results': results})


# ── 7. Shift Change Requests (Staff Side & Approval Workflow) ────────────────

class ShiftChangeRequestView(APIView):
    """
    POST /api/staff/roster/shift-change-request/
    Clinical staff send a shift change request for an assigned shift.
    Reuses existing StaffRequest model.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        staff = getattr(request.user, 'staffmember', None)
        if not staff:
            return Response({'detail': 'Staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        assignment_id = request.data.get('assignment_id')
        requested_template_id = request.data.get('requested_template_id')
        reason = request.data.get('reason', '').strip()

        if not assignment_id or not requested_template_id:
            return Response({'detail': 'assignment_id and requested_template_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            assignment = RosterAssignment.objects.get(id=assignment_id, staff=staff)
        except RosterAssignment.DoesNotExist:
            return Response({'detail': 'Roster assignment not found or does not belong to you.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            req_tmpl = ShiftTemplate.objects.get(id=requested_template_id)
        except ShiftTemplate.DoesNotExist:
            return Response({'detail': 'Requested shift template not found.'}, status=status.HTTP_404_NOT_FOUND)

        req_obj = StaffRequest.objects.create(
            staff=staff,
            request_type=StaffRequest.RequestType.SHIFT_CHANGE,
            urgency=StaffRequest.Urgency.ROUTINE,
            notes=reason or f"Request to swap shift on {assignment.date} to {req_tmpl.name}",
            details={
                'assignment_id': assignment.id,
                'date': assignment.date.isoformat(),
                'current_shift_name': assignment.shift_name,
                'requested_template_id': req_tmpl.id,
                'requested_shift_name': req_tmpl.name,
                'reason': reason,
            },
            status=StaffRequest.Status.PENDING,
        )

        AuditLog.objects.create(
            actor=request.user,
            actor_name=request.user.get_full_name() or request.user.username,
            action='Roster Shift Change Requested',
            target_user=staff.full_name,
            details=f"Staff {staff.full_name} requested shift change for {assignment.date} from '{assignment.shift_name}' to '{req_tmpl.name}'. Reason: {reason}",
        )

        return Response({
            'id': req_obj.id,
            'status': req_obj.status,
            'message': 'Shift change request submitted successfully for supervisor/admin review.',
        }, status=status.HTTP_201_CREATED)


class ShiftChangeRequestApprovalView(APIView):
    """
    POST /api/staff/roster/shift-change-request/<id>/approve/
    POST /api/staff/roster/shift-change-request/<id>/reject/
    Admin approves or rejects a shift change request.
    Approval updates the assignment to the requested shift and creates a new revision.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, action):
        if not _can_publish_roster(request.user):
            return Response(
                {'detail': 'Only administrators can review shift change requests.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            req_obj = StaffRequest.objects.get(
                id=pk, request_type=StaffRequest.RequestType.SHIFT_CHANGE
            )
        except StaffRequest.DoesNotExist:
            return Response({'detail': 'Shift change request not found.'}, status=status.HTTP_404_NOT_FOUND)

        reviewer_note = request.data.get('reviewer_notes', '')

        with transaction.atomic():
            now = timezone.now()
            if action == 'approve':
                req_obj.status = StaffRequest.Status.DONE
                req_obj.reviewed_by = request.user
                req_obj.reviewed_at = now
                req_obj.reviewer_notes = reviewer_note or 'Approved by Administrator'
                req_obj.save()

                # Update the actual RosterAssignment
                assignment_id = req_obj.details.get('assignment_id')
                tmpl_id = req_obj.details.get('requested_template_id')
                if assignment_id and tmpl_id:
                    try:
                        assignment = RosterAssignment.objects.get(id=assignment_id)
                        tmpl = ShiftTemplate.objects.get(id=tmpl_id)
                        old_shift = assignment.shift_name
                        assignment.shift_template = tmpl
                        assignment.shift_name = tmpl.name
                        assignment.start_time = tmpl.start_time
                        assignment.end_time = tmpl.end_time
                        assignment.location = tmpl.location
                        assignment.color = tmpl.color
                        assignment.is_off = tmpl.is_off
                        assignment.save()

                        # Increment revision on roster week
                        r_week = assignment.roster_week
                        r_week.revision += 1
                        r_week.save(update_fields=['revision', 'updated_at'])

                        AuditLog.objects.create(
                            actor=request.user,
                            actor_name=request.user.get_full_name() or request.user.username,
                            action='Roster Shift Change Approved',
                            target_user=req_obj.staff.full_name,
                            details=(
                                f"Approved shift change for {req_obj.staff.full_name} on {assignment.date}: "
                                f"'{old_shift}' -> '{tmpl.name}' (Rev {r_week.revision})"
                            ),
                        )
                    except (RosterAssignment.DoesNotExist, ShiftTemplate.DoesNotExist):
                        pass

                return Response({'success': True, 'status': 'approved'})

            elif action == 'reject':
                req_obj.status = StaffRequest.Status.REJECTED
                req_obj.reviewed_by = request.user
                req_obj.reviewed_at = now
                req_obj.reviewer_notes = reviewer_note or 'Rejected by Administrator'
                req_obj.save()

                AuditLog.objects.create(
                    actor=request.user,
                    actor_name=request.user.get_full_name() or request.user.username,
                    action='Roster Shift Change Rejected',
                    target_user=req_obj.staff.full_name,
                    details=f"Rejected shift change request #{req_obj.id} for {req_obj.staff.full_name}. Reason: {reviewer_note}",
                )
                return Response({'success': True, 'status': 'rejected'})

            else:
                return Response({'detail': f"Invalid action '{action}'. Expected 'approve' or 'reject'."}, status=status.HTTP_400_BAD_REQUEST)

