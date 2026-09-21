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
        staff_id = request.query_params.get('staff_id') or request.query_params.get('staff')
        if staff_id:
            qs = qs.filter(assigned_staff_id=staff_id)
        elif hasattr(request.user, 'staffmember'):
            qs = qs.filter(assigned_staff=request.user.staffmember)
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
        """Assign or reassign a primary and backup staff member to this booking."""
        booking = self.get_object()
        staff_id = request.data.get('staff_id')
        if not staff_id:
            return Response({'error': 'staff_id required'}, status=status.HTTP_400_BAD_REQUEST)
        from staff.models import StaffMember
        try:
            staff = StaffMember.objects.get(pk=staff_id)
        except StaffMember.DoesNotExist:
            return Response({'error': 'Primary staff not found'}, status=status.HTTP_404_NOT_FOUND)
        
        booking.assigned_staff = staff
        booking.status = request.data.get('status', 'assigned')
        booking.assigned_on = timezone.now()

        # Optional backup staff member
        backup_staff_id = request.data.get('backup_staff_id')
        if backup_staff_id:
            try:
                booking.backup_staff = StaffMember.objects.get(pk=backup_staff_id)
            except StaffMember.DoesNotExist:
                booking.backup_staff = None
        else:
            booking.backup_staff = None
        
        if request.data.get('care_manager_name'):
            booking.care_manager_name = request.data.get('care_manager_name')
        if request.data.get('clinical_requirements'):
            booking.clinical_requirements = request.data.get('clinical_requirements')
        if request.data.get('instructions'):
            booking.notes = request.data.get('instructions')
        if 'recurring_days' in request.data:
            booking.recurring_days = request.data.get('recurring_days') or []
        if 'recurrence_end_date' in request.data:
            booking.recurrence_end_date = request.data.get('recurrence_end_date') or None

        booking.save()

        # Generate recurring bookings if recurrence specified
        from .services import generate_recurring_bookings
        should_recur = request.data.get('generate_recurring', True)
        if should_recur and (booking.recurring_days or booking.shift_frequency != 'once'):
            generate_recurring_bookings(
                booking,
                recurring_days=booking.recurring_days,
                end_date=booking.recurrence_end_date,
                occurrences=request.data.get('occurrences', 30)
            )

        # Fire a notification to the assigned nurse/doctor's linked auth.User
        if staff.user:
            from notifications.views import create_notification
            create_notification(
                recipient_user=staff.user,
                message=(
                    f'📋 New booking assigned ({booking.reference_code or f"#{booking.pk}"}): {booking.patient.full_name} — '
                    f'{booking.get_service_type_display()} ({booking.get_shift_duration_display()}) on '
                    f'{booking.scheduled_time.strftime("%d %b %Y at %H:%M")}'
                ),
                icon_key='calendar',
                target_screen='Schedule',
                target_params={'booking_id': booking.pk},
            )

        if booking.backup_staff and booking.backup_staff.user:
            from notifications.views import create_notification
            create_notification(
                recipient_user=booking.backup_staff.user,
                message=(
                    f'🛡️ Clinical Backup Assigned ({booking.reference_code or f"#{booking.pk}"}): {booking.patient.full_name} — '
                    f'{booking.get_service_type_display()} on '
                    f'{booking.scheduled_time.strftime("%d %b %Y at %H:%M")}'
                ),
                icon_key='shield',
                target_screen='Schedule',
                target_params={'booking_id': booking.pk},
            )

        return Response(BookingDetailSerializer(booking).data)

    @action(detail=True, methods=['post'])
    def generate_recurring(self, request, pk=None):
        """Explicitly generate recurring visit bookings for a booking."""
        booking = self.get_object()
        from .services import generate_recurring_bookings
        recurring_days = request.data.get('recurring_days', booking.recurring_days)
        end_date = request.data.get('end_date', booking.recurrence_end_date)
        occurrences = request.data.get('occurrences', 30)

        if recurring_days:
            booking.recurring_days = recurring_days
        if end_date:
            booking.recurrence_end_date = end_date
        booking.save(update_fields=['recurring_days', 'recurrence_end_date'])

        created = generate_recurring_bookings(
            booking,
            recurring_days=recurring_days,
            end_date=end_date,
            occurrences=occurrences
        )
        return Response({
            'success': True,
            'parent_booking_id': booking.pk,
            'generated_count': len(created),
            'bookings': BookingListSerializer(created, many=True).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def generate_invoice(self, request, pk=None):
        """Generate a formal billing invoice for this booking."""
        booking = self.get_object()
        from billing.services import generate_invoice_for_booking
        from billing.serializers import InvoiceDetailSerializer
        invoice = generate_invoice_for_booking(booking)
        return Response(InvoiceDetailSerializer(invoice).data, status=status.HTTP_201_CREATED)

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
