from rest_framework import serializers
from .models import Medicine, MedicineOrder, MedicineOrderItem
from patients.serializers import PatientSummarySerializer
from staff.serializers import StaffSummarySerializer


class MedicineSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Medicine
        fields = [
            'id', 'name', 'generic_name', 'requires_prescription',
            'unit_price', 'stock_quantity', 'category', 'category_display',
            'dosage_form', 'strength', 'manufacturer', 'is_active',
            'is_low_stock', 'created_at', 'updated_at'
        ]

    def get_is_low_stock(self, obj):
        return obj.stock_quantity <= 15


class MedicineOrderItemSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)
    generic_name = serializers.CharField(source='medicine.generic_name', read_only=True)
    requires_prescription = serializers.BooleanField(source='medicine.requires_prescription', read_only=True)
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = MedicineOrderItem
        fields = [
            'id', 'medicine', 'medicine_name', 'generic_name',
            'requires_prescription', 'quantity', 'price_at_order', 'subtotal'
        ]

    def get_subtotal(self, obj):
        return obj.quantity * obj.price_at_order


class MedicineOrderListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mr = serializers.CharField(source='patient.mr_number', read_only=True)
    delivery_staff_name = serializers.CharField(source='delivery_staff.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    items_count = serializers.IntegerField(source='items.count', read_only=True)
    requires_prescription = serializers.SerializerMethodField()

    class Meta:
        model = MedicineOrder
        fields = [
            'id', 'patient', 'patient_name', 'patient_mr',
            'prescription_file', 'status', 'status_display',
            'delivery_address', 'delivery_staff', 'delivery_staff_name',
            'total_amount', 'payment_status', 'payment_status_display',
            'items_count', 'requires_prescription',
            'delivered_at', 'delivery_latitude', 'delivery_longitude',
            'created_at'
        ]

    def get_requires_prescription(self, obj):
        return obj.has_prescription_required_items


class MedicineOrderDetailSerializer(serializers.ModelSerializer):
    patient = PatientSummarySerializer(read_only=True)
    delivery_staff = StaffSummarySerializer(read_only=True)
    items = MedicineOrderItemSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    has_rx_items = serializers.SerializerMethodField()

    class Meta:
        model = MedicineOrder
        fields = [
            'id', 'patient', 'prescription_file', 'status', 'status_display',
            'delivery_address', 'delivery_staff',
            'total_amount', 'payment_status', 'payment_status_display',
            'delivery_latitude', 'delivery_longitude', 'delivered_at', 'delivery_notes',
            'notes', 'items', 'has_rx_items', 'created_at', 'updated_at'
        ]

    def get_has_rx_items(self, obj):
        return obj.has_prescription_required_items
