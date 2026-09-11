from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import StaffMember, LeaveRequest, AttendanceRecord
from .serializers import (
    StaffListSerializer, StaffDetailSerializer, StaffCreateSerializer,
    LeaveRequestSerializer, AttendanceRecordSerializer,
)


class StaffViewSet(viewsets.ModelViewSet):
    queryset = StaffMember.objects.filter(is_active=True)

    def get_serializer_class(self):
        if self.action in ['list']:
            return StaffListSerializer
        if self.action in ['create']:
            return StaffCreateSerializer
        return StaffDetailSerializer

    @action(detail=False, methods=['get'])
    def available(self, request):
        """Staff members currently available for assignment."""
        qs = self.get_queryset().filter(status='available')
        return Response(StaffListSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def on_visit(self, request):
        """Staff currently on a visit (for live tracking)."""
        qs = self.get_queryset().filter(status='on_visit')
        return Response(StaffListSerializer(qs, many=True).data)

    @action(detail=True, methods=['get'])
    def attendance(self, request, pk=None):
        staff = self.get_object()
        records = staff.attendance_records.all()[:60]
        return Response(AttendanceRecordSerializer(records, many=True).data)


class LeaveRequestViewSet(viewsets.ModelViewSet):
    queryset = LeaveRequest.objects.select_related('staff').all()
    serializer_class = LeaveRequestSerializer

    @action(detail=True, methods=['post'])
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

    @action(detail=True, methods=['post'])
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
