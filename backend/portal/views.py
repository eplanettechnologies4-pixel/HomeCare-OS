from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from patients.models import Patient
from patients.serializers import PatientDetailSerializer
from bookings.models import Booking
from bookings.serializers import BookingListSerializer
from billing.models import Invoice
from billing.serializers import InvoiceListSerializer, PortalInvoiceSerializer


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
      GET /api/portal/my/patient_profile/
      GET /api/portal/my/visits/
      GET /api/portal/my/invoices/
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_patient(self, request):
        """
        Resolve the Patient for this request.
        - Family users: always their linked patient (ignores ?patient_id).
        - Staff/admin: use ?patient_id query param (legacy behaviour).
        Returns (patient, error_response).  If patient is None, error_response
        is a ready-to-return Response; otherwise error_response is None.
        """
        user = request.user

        # Family / portal users — scope strictly to their own patient
        linked_patient = _resolve_patient_for_user(user)
        profile = getattr(user, 'profile', None)
        profile_role = getattr(profile, 'role', None) if profile else None
        is_family = (profile_role == 'patient_family') or (linked_patient is not None and not hasattr(user, 'staffmember'))

        if is_family:
            if linked_patient is None:
                return None, Response(
                    {'detail': 'No patient record is linked to your account. Please contact support.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            return linked_patient, None

        # Staff / admin path: use ?patient_id param
        patient_id = request.query_params.get('patient_id')
        if not patient_id:
            return None, Response(
                {'detail': 'patient_id query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            patient = Patient.objects.get(pk=patient_id)
            return patient, None
        except Patient.DoesNotExist:
            return None, Response({'detail': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

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

    @action(detail=False, methods=['get'])
    def invoices(self, request):
        patient, err = self._get_patient(request)
        if err:
            return err
        qs = Invoice.objects.filter(patient=patient).prefetch_related('line_items').order_by('-issued_date')
        return Response(PortalInvoiceSerializer(qs, many=True, context={'request': request}).data)
