from rest_framework import serializers
from .models import EquipmentItem, EquipmentRental
from patients.serializers import PatientSummarySerializer
from staff.serializers import StaffSummarySerializer


class EquipmentItemSerializer(serializers.ModelSerializer):
    is_low_availability = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentItem
        fields = [
            'id', 'name', 'description', 'category',
            'daily_rate', 'weekly_rate', 'monthly_rate',
            'security_deposit', 'total_units', 'available_units',
            'is_low_availability', 'image', 'is_active',
            'created_at', 'updated_at'
        ]

    def get_is_low_availability(self, obj):
        return obj.available_units <= 1


class EquipmentRentalListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mr = serializers.CharField(source='patient.mr_number', read_only=True)
    equipment_name = serializers.CharField(source='equipment.name', read_only=True)
    delivery_staff_name = serializers.CharField(source='delivery_staff.full_name', read_only=True)
    pickup_staff_name = serializers.CharField(source='pickup_staff.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = EquipmentRental
        fields = [
            'id', 'patient', 'patient_name', 'patient_mr',
            'equipment', 'equipment_name',
            'rental_start', 'rental_end', 'status', 'status_display',
            'deposit_amount', 'deposit_refunded', 'total_rental_fee',
            'delivery_staff', 'delivery_staff_name',
            'pickup_staff', 'pickup_staff_name',
            'delivered_at', 'returned_at',
            'created_at'
        ]


class EquipmentRentalDetailSerializer(serializers.ModelSerializer):
    patient = PatientSummarySerializer(read_only=True)
    equipment = EquipmentItemSerializer(read_only=True)
    delivery_staff = StaffSummarySerializer(read_only=True)
    pickup_staff = StaffSummarySerializer(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = EquipmentRental
        fields = [
            'id', 'patient', 'equipment', 'rental_start', 'rental_end',
            'status', 'status_display', 'rental_rate_type', 'total_rental_fee',
            'deposit_amount', 'deposit_refunded', 'delivery_address',
            'delivery_staff', 'delivery_latitude', 'delivery_longitude', 'delivered_at', 'delivery_notes',
            'pickup_staff', 'pickup_latitude', 'pickup_longitude', 'returned_at', 'pickup_notes',
            'notes', 'created_at', 'updated_at'
        ]
