from rest_framework import serializers
from .models import Booking
from patients.serializers import PatientSummarySerializer
from staff.serializers import StaffSummarySerializer


class BookingListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mr = serializers.CharField(source='patient.mr_number', read_only=True)
    staff_name = serializers.CharField(source='assigned_staff.full_name', read_only=True)
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)

    class Meta:
        model = Booking
        fields = [
            'id', 'patient_name', 'patient_mr', 'staff_name',
            'service_type', 'service_type_display',
            'status', 'status_display',
            'payment_status', 'payment_status_display',
            'scheduled_time', 'actual_start_time', 'actual_end_time',
            'amount', 'amount_paid', 'balance_due',
            'created_at',
        ]


class BookingDetailSerializer(serializers.ModelSerializer):
    patient = PatientSummarySerializer(read_only=True)
    assigned_staff = StaffSummarySerializer(read_only=True)
    patient_id = serializers.PrimaryKeyRelatedField(
        queryset=__import__('patients').models.Patient.objects.all(),
        source='patient', write_only=True
    )
    assigned_staff_id = serializers.PrimaryKeyRelatedField(
        queryset=__import__('staff').models.StaffMember.objects.all(),
        source='assigned_staff', write_only=True, required=False, allow_null=True
    )
    duration_minutes = serializers.ReadOnlyField()
    balance_due = serializers.ReadOnlyField()
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)

    class Meta:
        model = Booking
        fields = '__all__'
