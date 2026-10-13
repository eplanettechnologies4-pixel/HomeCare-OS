from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from patients.models import Patient
from patients.serializers import PatientDetailSerializer, VitalSignSerializer
from bookings.models import Booking
from bookings.serializers import BookingListSerializer
from billing.models import Invoice
from billing.serializers import PortalInvoiceSerializer
from notifications.models import Notification
from notifications.serializers import NotificationSerializer
from notifications.views import create_notification


def _resolve_patient_for_user(user):
    """
    Returns the Patient linked to this portal user, or None.
    Uses Patient.portal_user (OneToOneField, related_name='patient_profile').
    Safe — never raises; returns None if no link exists.
    """
    return getattr(user, 'patient_profile', None)


class FamilyPortalViewSet(viewsets.ViewSet):
    """
    Lightweight API endpoints for Patient/Family Portal.

    Authentication: JWT required (IsAuthenticated).
    Authorization:  the patient data returned is always scoped to the
                    logged-in family user's linked Patient record.
                    Staff / admin callers may pass ?patient_id= to override
                    (backwards-compatible for the admin dashboard).

    Endpoints:
      GET  /api/portal/my/patient/
      GET  /api/portal/my/patient_profile/
      GET  /api/portal/my/visits/
      GET  /api/portal/my/vitals/
      GET  /api/portal/my/invoices/
      GET  /api/portal/my/messages/
      POST /api/portal/my/messages/
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_patient(self, request):
        """
        Resolve the Patient for this request safely.
        - Family / unprivileged users: strictly their linked patient.
          If unlinked, return a clean 404 response immediately (never 500).
        - Staff / admin: allow ?patient_id override.
        """
        user = request.user
        linked_patient = _resolve_patient_for_user(user)

        is_staff_or_admin = (
            user.is_superuser or
            user.is_staff or
            hasattr(user, 'staffmember')
        )

        if not is_staff_or_admin:
            if linked_patient is None:
                return None, Response(
                    {'detail': 'No patient record is linked to your account. Please contact support.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            return linked_patient, None

        # Staff / admin path: use ?patient_id param
        patient_id = request.query_params.get('patient_id')
        if not patient_id:
            if linked_patient:
                return linked_patient, None
            return None, Response(
                {'detail': 'patient_id query parameter is required for staff access.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            patient = Patient.objects.get(pk=int(patient_id))
            return patient, None
        except (Patient.DoesNotExist, ValueError):
            return None, Response({'detail': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'], url_path='patient')
    def patient(self, request):
        patient, err = self._get_patient(request)
        if err:
            return err
        return Response(PatientDetailSerializer(patient).data)

    @action(detail=False, methods=['get'])
    def patient_profile(self, request):
        patient, err = self._get_patient(request)
        if err:
            return err
        return Response(PatientDetailSerializer(patient).data)

    @action(detail=False, methods=['get'])
    def visits(self, request):
        patient, err = self._get_patient(request)
        if err:
            return err
        qs = Booking.objects.filter(patient=patient).order_by('-scheduled_time')
        return Response(BookingListSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='vitals')
    def vitals(self, request):
        patient, err = self._get_patient(request)
        if err:
            return err
        qs = patient.vitals.all().order_by('-recorded_at')
        return Response(VitalSignSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def invoices(self, request):
        patient, err = self._get_patient(request)
        if err:
            return err
        qs = Invoice.objects.filter(patient=patient).prefetch_related('line_items').order_by('-issued_date')
        return Response(PortalInvoiceSerializer(qs, many=True, context={'request': request}).data)

    @action(detail=False, methods=['get', 'post'], url_path='messages')
    def messages(self, request):
        patient, err = self._get_patient(request)
        if err:
            return err

        if request.method == 'POST':
            msg_text = request.data.get('message') or request.data.get('body') or ''
            active_booking = patient.bookings.filter(status__in=['assigned', 'en_route', 'in_progress']).first()
            if active_booking and active_booking.assigned_staff and active_booking.assigned_staff.user:
                create_notification(
                    recipient_user=active_booking.assigned_staff.user,
                    message=f"Message from family of {patient.full_name}: {msg_text[:100]}",
                    icon_key='message',
                )
            return Response({
                'success': True,
                'detail': 'Message transmitted to care team.',
                'message': msg_text,
            }, status=status.HTTP_201_CREATED)

        notifications = Notification.objects.filter(recipient=request.user).order_by('-created_at')[:50]
        return Response(NotificationSerializer(notifications, many=True).data)
