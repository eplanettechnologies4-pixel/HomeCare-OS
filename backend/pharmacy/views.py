import json
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Medicine, MedicineOrder, MedicineOrderItem, MedicineOrderStatus
from .serializers import (
    MedicineSerializer,
    MedicineOrderListSerializer,
    MedicineOrderDetailSerializer,
)
from staff.models import StaffMember
from patients.models import Patient
from notifications.models import Notification


class MedicineViewSet(viewsets.ModelViewSet):
    """
    Searchable Medicine Catalog & Inventory
    GET /api/pharmacy/medicines/
    Supports filtering by search query, category, and low stock threshold.
    """
    queryset = Medicine.objects.filter(is_active=True)
    serializer_class = MedicineSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Medicine.objects.filter(is_active=True)
        search = self.request.query_params.get('search', '').strip()
        category = self.request.query_params.get('category', '').strip()
        low_stock = self.request.query_params.get('low_stock')

        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(generic_name__icontains=search) |
                Q(category__icontains=search)
            )
        if category:
            qs = qs.filter(category=category)
        if low_stock and low_stock.lower() in ('true', '1'):
            qs = qs.filter(stock_quantity__lte=15)

        return qs


class MedicineOrderViewSet(viewsets.ModelViewSet):
    """
    Medicine Orders Management
    GET /api/pharmacy/orders/
    POST /api/pharmacy/orders/
    PATCH /api/pharmacy/orders/{id}/confirm/
    POST /api/pharmacy/orders/{id}/deliver/
    """
    queryset = MedicineOrder.objects.select_related('patient', 'delivery_staff').prefetch_related('items__medicine').all()
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return MedicineOrderListSerializer
        return MedicineOrderDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        # If patient portal user, only return their own orders
        if hasattr(user, 'patient_profile') and user.patient_profile:
            qs = qs.filter(patient=user.patient_profile)
        elif hasattr(user, 'staffmember') and user.staffmember:
            staff = user.staffmember
            # If rider/delivery staff, show orders assigned to them, unless admin
            if staff.role in ('nurse', 'delivery_rider') and getattr(staff, 'specialization', '') == 'Delivery Staff':
                qs = qs.filter(delivery_staff=staff)

        # Filters
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
        Create a new medicine order with items and optional prescription file.
        Body:
          - patient_id: int
          - delivery_address: str
          - prescription_file: file (optional upload)
          - items: JSON list of [{"medicine_id": 1, "quantity": 2}, ...]
          - notes: str (optional)
        """
        data = request.data
        patient_id = data.get('patient_id')
        if not patient_id:
            if hasattr(request.user, 'patient_profile') and request.user.patient_profile:
                patient_id = request.user.patient_profile.id
            else:
                return Response({'error': 'patient_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            patient = Patient.objects.get(pk=patient_id)
        except Patient.DoesNotExist:
            return Response({'error': 'Patient not found'}, status=status.HTTP_404_NOT_FOUND)

        delivery_address = data.get('delivery_address') or getattr(patient, 'address', '')
        prescription_file = request.FILES.get('prescription_file')

        # Parse items JSON if passed as string in multipart
        raw_items = data.get('items', '[]')
        if isinstance(raw_items, str):
            try:
                items_data = json.loads(raw_items)
            except Exception:
                items_data = []
        else:
            items_data = raw_items

        if not items_data:
            return Response({'error': 'At least one medicine item is required'}, status=status.HTTP_400_BAD_REQUEST)

        order = MedicineOrder.objects.create(
            patient=patient,
            delivery_address=delivery_address,
            prescription_file=prescription_file,
            notes=data.get('notes', ''),
            status=MedicineOrderStatus.PENDING,
            payment_status=data.get('payment_status', 'unpaid'),
        )

        total_amount = 0
        for item in items_data:
            med_id = item.get('medicine_id') or item.get('id')
            qty = int(item.get('quantity', 1))
            try:
                med = Medicine.objects.get(pk=med_id)
            except Medicine.DoesNotExist:
                continue

            item_price = med.unit_price
            MedicineOrderItem.objects.create(
                order=order,
                medicine=med,
                quantity=qty,
                price_at_order=item_price
            )
            total_amount += (item_price * qty)
            # Deduct stock
            if med.stock_quantity >= qty:
                med.stock_quantity -= qty
                med.save(update_fields=['stock_quantity'])

        order.total_amount = total_amount
        order.save(update_fields=['total_amount'])

        serializer = MedicineOrderDetailSerializer(order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch', 'post'], url_path='confirm')
    def confirm(self, request, pk=None):
        """
        PATCH /api/pharmacy/orders/{id}/confirm/
        Admin confirms order and assigns delivery staff.
        
        SERVER-SIDE ENFORCEMENT:
        If any medicine in the order requires a prescription,
        the order CANNOT be confirmed until a prescription_file is attached.
        """
        order = self.get_object()

        # Server-side prescription check
        if order.has_prescription_required_items and not order.prescription_file:
            return Response({
                'error': 'Cannot confirm order: One or more medications require a doctor prescription, but no prescription file is attached to this order.',
                'code': 'prescription_required'
            }, status=status.HTTP_400_BAD_REQUEST)

        delivery_staff_id = request.data.get('delivery_staff_id') or request.data.get('delivery_staff')
        if delivery_staff_id:
            try:
                staff = StaffMember.objects.get(pk=delivery_staff_id)
                order.delivery_staff = staff
            except StaffMember.DoesNotExist:
                return Response({'error': 'Delivery staff not found'}, status=status.HTTP_404_NOT_FOUND)

        order.status = MedicineOrderStatus.CONFIRMED
        # If delivery rider is already assigned, can move to out_for_delivery
        if request.data.get('status') == 'out_for_delivery' or order.delivery_staff:
            order.status = MedicineOrderStatus.OUT_FOR_DELIVERY

        order.save(update_fields=['status', 'delivery_staff', 'updated_at'])

        # Notify assigned delivery staff if exists
        if order.delivery_staff and order.delivery_staff.user:
            Notification.objects.create(
                recipient=order.delivery_staff.user,
                icon_key='truck',
                message=f"New medicine delivery assigned for patient {order.patient.full_name} at {order.delivery_address[:40]}.",
                target_screen='TodaySchedule',
                target_params={'order_id': order.id, 'service_type': 'medicine_delivery'}
            )

        return Response(MedicineOrderDetailSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='deliver')
    def deliver(self, request, pk=None):
        """
        POST /api/pharmacy/orders/{id}/deliver/
        Delivery staff marks order as delivered with GPS proof.
        Body:
          - lat: float
          - lng: float
          - notes: str (optional)
        """
        order = self.get_object()
        lat = request.data.get('lat') or request.data.get('latitude')
        lng = request.data.get('lng') or request.data.get('longitude')
        notes = request.data.get('notes', '')

        now = timezone.now()
        order.status = MedicineOrderStatus.DELIVERED
        order.delivered_at = now
        if lat is not None:
            order.delivery_latitude = lat
        if lng is not None:
            order.delivery_longitude = lng
        if notes:
            order.delivery_notes = notes

        order.save(update_fields=[
            'status', 'delivered_at', 'delivery_latitude',
            'delivery_longitude', 'delivery_notes', 'updated_at'
        ])

        # Notify patient / family
        if order.patient.portal_user:
            Notification.objects.create(
                recipient=order.patient.portal_user,
                icon_key='pill',
                message=f"Your medication order #{order.id} has been delivered successfully.",
                target_screen='PharmacyOrders',
                target_params={'order_id': order.id}
            )

        return Response({
            'detail': 'Order marked as delivered with GPS verification.',
            'order': MedicineOrderDetailSerializer(order).data
        })
