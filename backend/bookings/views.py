from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from .models import Booking
from .serializers import BookingListSerializer, BookingDetailSerializer
from .filters import BookingFilter


class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.select_related('patient', 'assigned_staff').all()
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = BookingFilter
    search_fields = ['patient__first_name', 'patient__last_name', 'patient__mr_number']
    ordering_fields = ['scheduled_time', 'created_at', 'status', 'amount']
    ordering = ['-scheduled_time']

    def get_serializer_class(self):
        if self.action in ['list']:
            return BookingListSerializer
        return BookingDetailSerializer

    @action(detail=False, methods=['get'])
    def today(self, request):
        """Return all bookings scheduled for today."""
        today = timezone.now().date()
        qs = self.get_queryset().filter(scheduled_time__date=today)
        serializer = BookingListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Return bookings currently in progress."""
        qs = self.get_queryset().filter(status__in=['en_route', 'in_progress'])
        serializer = BookingListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def assign_staff(self, request, pk=None):
        """Assign or reassign a staff member to this booking."""
        booking = self.get_object()
        staff_id = request.data.get('staff_id')
        if not staff_id:
            return Response({'error': 'staff_id required'}, status=status.HTTP_400_BAD_REQUEST)
        from staff.models import StaffMember
        try:
            staff = StaffMember.objects.get(pk=staff_id)
        except StaffMember.DoesNotExist:
            return Response({'error': 'Staff not found'}, status=status.HTTP_404_NOT_FOUND)
        booking.assigned_staff = staff
        booking.status = 'assigned'
        booking.save(update_fields=['assigned_staff', 'status'])

        # Fire a notification to the assigned nurse/doctor's linked auth.User
        if staff.user:
            from notifications.views import create_notification
            create_notification(
                recipient_user=staff.user,
                message=(
                    f'📋 New booking assigned: {booking.patient.full_name} — '
                    f'{booking.get_service_type_display()} on '
                    f'{booking.scheduled_time.strftime("%d %b %Y at %H:%M")}'
                ),
                icon_key='calendar',
                target_screen='Schedule',
                target_params={'booking_id': booking.pk},
            )

        return Response(BookingDetailSerializer(booking).data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Dashboard stat card data."""
        today = timezone.now().date()
        qs = Booking.objects.all()
        return Response({
            'active_visits': qs.filter(status='in_progress').count(),
            'today_bookings': qs.filter(scheduled_time__date=today).count(),
            'pending_assignments': qs.filter(status='pending').count(),
            'today_revenue': sum(
                b.amount_paid for b in qs.filter(
                    scheduled_time__date=today, status='completed'
                )
            ),
        })
