from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import EquipmentItem, EquipmentRental, EquipmentRentalStatus
from .serializers import (
    EquipmentItemSerializer,
    EquipmentRentalListSerializer,
    EquipmentRentalDetailSerializer,
)
from patients.models import Patient
from staff.models import StaffMember
from notifications.models import Notification


class EquipmentCatalogViewSet(viewsets.ModelViewSet):
    """
    GET  /api/equipment/catalog/
    POST /api/equipment/catalog/
    Equipment catalog and inventory tracking.
    """
    queryset = EquipmentItem.objects.filter(is_active=True)
    serializer_class = EquipmentItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = EquipmentItem.objects.filter(is_active=True)
        search = self.request.query_params.get('search', '').strip()
        category = self.request.query_params.get('category', '').strip()
        available_only = self.request.query_params.get('available')

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if category:
            qs = qs.filter(category=category)
        if available_only and available_only.lower() in ('true', '1'):
            qs = qs.filter(available_units__gt=0)
        return qs


class EquipmentRentalViewSet(viewsets.ModelViewSet):
    """
    Equipment Rental Management
    GET   /api/equipment/rentals/
    POST  /api/equipment/rentals/
    PATCH /api/equipment/rentals/{id}/deliver/
    PATCH /api/equipment/rentals/{id}/pickup/
    """
    queryset = EquipmentRental.objects.select_related('patient', 'equipment', 'delivery_staff', 'pickup_staff').all()
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return EquipmentRentalListSerializer
        return EquipmentRentalDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if hasattr(user, 'patient_profile') and user.patient_profile:
            qs = qs.filter(patient=user.patient_profile)
        elif hasattr(user, 'staffmember') and user.staffmember:
            staff = user.staffmember
            # If field staff, can see if assigned as delivery or pickup
            if staff.role in ('nurse', 'delivery_rider') and getattr(staff, 'specialization', '') == 'Delivery Staff':
                qs = qs.filter(Q(delivery_staff=staff) | Q(pickup_staff=staff))

        status_param = self.request.query_params.get('status')
        patient_id = self.request.query_params.get('patient_id')
        if status_param:
            qs = qs.filter(status=status_param)
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Request an equipment rental.
        Validates available_units > 0 and decrements on creation.
        """
        data = request.data
        patient_id = data.get('patient_id')
        if not patient_id:
            if hasattr(request.user, 'patient_profile') and request.user.patient_profile:
                patient_id = request.user.patient_profile.id
            else:
                return Response({'error': 'patient_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        equipment_id = data.get('equipment_id') or data.get('equipment')
        if not equipment_id:
            return Response({'error': 'equipment_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            patient = Patient.objects.get(pk=patient_id)
        except Patient.DoesNotExist:
            return Response({'error': 'Patient not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            equipment = EquipmentItem.objects.select_for_update().get(pk=equipment_id)
        except EquipmentItem.DoesNotExist:
            return Response({'error': 'Equipment not found'}, status=status.HTTP_404_NOT_FOUND)

        if equipment.available_units < 1:
            return Response({
                'error': f'No units of "{equipment.name}" currently available for rent.',
                'code': 'out_of_stock'
            }, status=status.HTTP_400_BAD_REQUEST)

        rental_start = data.get('rental_start') or timezone.now().date()
        rental_end = data.get('rental_end')
        if not rental_end:
            return Response({'error': 'rental_end date is required'}, status=status.HTTP_400_BAD_REQUEST)

        rate_type = data.get('rental_rate_type', 'daily')
        rental = EquipmentRental(
            patient=patient,
            equipment=equipment,
            rental_start=rental_start,
            rental_end=rental_end,
            rental_rate_type=rate_type,
            deposit_amount=equipment.security_deposit,
            delivery_address=data.get('delivery_address') or getattr(patient, 'address', ''),
            notes=data.get('notes', ''),
            status=EquipmentRentalStatus.REQUESTED
        )
        rental.calculate_estimated_fee()
        rental.save()

        # Decrement available units
        equipment.available_units -= 1
        equipment.save(update_fields=['available_units'])

        serializer = EquipmentRentalDetailSerializer(rental)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch', 'post'], url_path='deliver')
    def deliver(self, request, pk=None):
        """
        PATCH /api/equipment/rentals/{id}/deliver/
        Staff delivers equipment with GPS check-in verification.
        """
        rental = self.get_object()
        lat = request.data.get('lat') or request.data.get('latitude')
        lng = request.data.get('lng') or request.data.get('longitude')
        notes = request.data.get('notes', '')

        rental.status = EquipmentRentalStatus.ACTIVE
        rental.delivered_at = timezone.now()
        if lat is not None:
            rental.delivery_latitude = lat
        if lng is not None:
            rental.delivery_longitude = lng
        if notes:
            rental.delivery_notes = notes

        rental.save(update_fields=[
            'status', 'delivered_at', 'delivery_latitude',
            'delivery_longitude', 'delivery_notes', 'updated_at'
        ])

        if rental.patient.portal_user:
            Notification.objects.create(
                recipient=rental.patient.portal_user,
                icon_key='shield',
                message=f"Equipment '{rental.equipment.name}' has been delivered and activated for your home care.",
                target_screen='EquipmentRentals',
                target_params={'rental_id': rental.id}
            )

        return Response({
            'detail': 'Equipment marked as delivered and rental is active.',
            'rental': EquipmentRentalDetailSerializer(rental).data
        })

    @action(detail=True, methods=['patch', 'post'], url_path='pickup')
    @transaction.atomic
    def pickup(self, request, pk=None):
        """
        PATCH /api/equipment/rentals/{id}/pickup/
        Staff collects equipment, releases deposit refund, and returns unit to inventory.
        """
        rental = self.get_object()
        lat = request.data.get('lat') or request.data.get('latitude')
        lng = request.data.get('lng') or request.data.get('longitude')
        notes = request.data.get('notes', '')
        refund_deposit = request.data.get('refund_deposit', True)

        rental.status = EquipmentRentalStatus.RETURNED
        rental.returned_at = timezone.now()
        rental.deposit_refunded = bool(refund_deposit)
        if lat is not None:
            rental.pickup_latitude = lat
        if lng is not None:
            rental.pickup_longitude = lng
        if notes:
            rental.pickup_notes = notes

        rental.save(update_fields=[
            'status', 'returned_at', 'deposit_refunded',
            'pickup_latitude', 'pickup_longitude', 'pickup_notes', 'updated_at'
        ])

        # Return unit to available stock
        eq = EquipmentItem.objects.select_for_update().get(pk=rental.equipment_id)
        if eq.available_units < eq.total_units:
            eq.available_units += 1
            eq.save(update_fields=['available_units'])

        # Notify patient of successful return & deposit release
        if rental.patient.portal_user:
            Notification.objects.create(
                recipient=rental.patient.portal_user,
                icon_key='check',
                message=f"Equipment '{rental.equipment.name}' pickup completed. Security deposit of PKR {rental.deposit_amount} release initiated.",
                target_screen='EquipmentRentals',
                target_params={'rental_id': rental.id}
            )

        return Response({
            'detail': 'Equipment collected, returned to fleet stock, and deposit release processed.',
            'rental': EquipmentRentalDetailSerializer(rental).data
        })
