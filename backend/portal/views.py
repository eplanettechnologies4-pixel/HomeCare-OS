from rest_framework import viewsets, permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from patients.models import Patient
from patients.serializers import PatientDetailSerializer
from bookings.models import Booking
from bookings.serializers import BookingListSerializer
from billing.models import Invoice
from billing.serializers import InvoiceListSerializer


class FamilyPortalViewSet(viewsets.ViewSet):
    """
    Lightweight API endpoints for Patient/Family Portal.
    In production, this filters by the authenticated user's linked Patient ID.
    """
    permission_classes = [permissions.AllowAny] # For demo

    @action(detail=False, methods=['get'])
    def patient_profile(self, request):
        patient_id = request.query_params.get('patient_id', 1)
        try:
            patient = Patient.objects.get(pk=patient_id)
            return Response(PatientDetailSerializer(patient).data)
        except Patient.DoesNotExist:
            return Response({'error': 'Patient not found'}, status=404)

    @action(detail=False, methods=['get'])
    def visits(self, request):
        patient_id = request.query_params.get('patient_id', 1)
        qs = Booking.objects.filter(patient_id=patient_id).order_by('-scheduled_time')
        return Response(BookingListSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def invoices(self, request):
        patient_id = request.query_params.get('patient_id', 1)
        qs = Invoice.objects.filter(patient_id=patient_id).order_by('-issued_date')
        return Response(InvoiceListSerializer(qs, many=True).data)
