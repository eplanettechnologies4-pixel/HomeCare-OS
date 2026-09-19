from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from homecareOS.permissions import IsStaffManagementAllowed, IsCareManagerOrAdmin
from .models import StaffMember, LeaveRequest, AttendanceRecord
from .serializers import (
    StaffListSerializer, StaffDetailSerializer, StaffCreateSerializer,
    LeaveRequestSerializer, AttendanceRecordSerializer,
)


class StaffViewSet(viewsets.ModelViewSet):
    queryset = StaffMember.objects.all().order_by('-created_at')
    permission_classes = [IsStaffManagementAllowed]

    def get_serializer_class(self):
        if self.action in ['list']:
            return StaffListSerializer
        if self.action in ['create']:
            return StaffCreateSerializer
        return StaffDetailSerializer

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
