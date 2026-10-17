from rest_framework import serializers
from .models import Booking, ServiceCatalogItem
from patients.serializers import PatientSummarySerializer
from staff.serializers import StaffSummarySerializer

CATEGORY_DISPLAY_MAP = {
    'doctors': 'Doctors',
    'short_service': 'Nursing Short Term',
    'nursing_short_term': 'Nursing Short Term',
    'long_term': 'Nursing Long Term',
    'nursing_long_term': 'Nursing Long Term',
    'physiotherapy': 'Physiotherapy',
    'psychology': 'Psychology',
    'lab': 'Lab',
    'lab_test': 'Lab',
    'pharmacy': 'Pharmacy',
    'medicine_delivery': 'Pharmacy',
    'equipment_rental': 'Equipment Rental',
    'nutrition': 'Nutrition',
    'baby_sitter': 'Baby Sitter',
}


class BookingListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mr = serializers.CharField(source='patient.mr_number', read_only=True)
    patient_phone = serializers.CharField(source='patient.phone', read_only=True)
    patient_source = serializers.CharField(source='patient.source', read_only=True)
    patient_source_display = serializers.CharField(source='patient.get_source_display', read_only=True)
    staff_name = serializers.CharField(source='assigned_staff.full_name', read_only=True)
    staff_employee_id = serializers.CharField(source='assigned_staff.employee_id', read_only=True)
    staff_designation = serializers.SerializerMethodField()
    backup_staff_name = serializers.CharField(source='backup_staff.full_name', read_only=True)
    backup_staff_employee_id = serializers.CharField(source='backup_staff.employee_id', read_only=True)
    backup_staff_designation = serializers.SerializerMethodField()
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)
    service_mode_display = serializers.CharField(source='get_service_mode_display', read_only=True)
    provider_level_display = serializers.CharField(source='get_provider_level_display', read_only=True)
    shift_role_display = serializers.CharField(source='get_shift_role_display', read_only=True)
    rental_period_display = serializers.CharField(source='get_rental_period_display', read_only=True)
    shift_duration_display = serializers.CharField(source='get_shift_duration_display', read_only=True)
    shift_frequency_display = serializers.CharField(source='get_shift_frequency_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)

    def get_staff_designation(self, obj):
        if not obj.assigned_staff:
            return None
        role = obj.assigned_staff.get_role_display()
        spec = obj.assigned_staff.specialization
        return f"{role} ({spec})" if spec else role

    def get_backup_staff_designation(self, obj):
        if not obj.backup_staff:
            return None
        role = obj.backup_staff.get_role_display()
        spec = obj.backup_staff.specialization
        return f"{role} ({spec})" if spec else role

    class Meta:
        model = Booking
        fields = [
            'id', 'reference_code',
            # Patient Intake Required & Optional
            'patient_name', 'patient_mr', 'patient_phone', 'patient_source', 'patient_source_display',
            'patient_age', 'patient_dob',
            'emergency_contact_name', 'emergency_contact_phone', 'email',
            'address', 'latitude', 'longitude',
            'diagnosis', 'allergies', 'has_prescription', 'consult_doctor_needed',
            'service_type', 'service_type_display',
            'requested_item', 'service_mode', 'service_mode_display',
            'provider_level', 'provider_level_display', 'shift_role', 'shift_role_display',
            'rental_period', 'rental_period_display', 'estimated_price',
            'scheduled_time', 'actual_start_time', 'actual_end_time',
            'shift_duration', 'shift_duration_display',
            'shift_frequency', 'shift_frequency_display',
            'payment_method', 'payment_status', 'payment_status_display',
            'gender_preference', 'consultant_name', 'consultant_details', 'notes',
            # Assignment Required
            'staff_name', 'staff_employee_id', 'staff_designation',
            'backup_staff_name', 'backup_staff_employee_id', 'backup_staff_designation',
            'care_manager_name', 'clinical_requirements', 'assigned_on',
            'status', 'status_display',
            # Financials
            'amount', 'amount_paid', 'balance_due',
            'recurring_days', 'recurrence_end_date', 'parent_booking',
            'created_at',
        ]


class BookingDetailSerializer(serializers.ModelSerializer):
    patient = PatientSummarySerializer(read_only=True)
    assigned_staff = StaffSummarySerializer(read_only=True)
    backup_staff = StaffSummarySerializer(read_only=True)
    patient_id = serializers.PrimaryKeyRelatedField(
        queryset=__import__('patients').models.Patient.objects.all(),
        source='patient', write_only=True
    )
    assigned_staff_id = serializers.PrimaryKeyRelatedField(
        queryset=__import__('staff').models.StaffMember.objects.all(),
        source='assigned_staff', write_only=True, required=False, allow_null=True
    )
    backup_staff_id = serializers.PrimaryKeyRelatedField(
        queryset=__import__('staff').models.StaffMember.objects.all(),
        source='backup_staff', write_only=True, required=False, allow_null=True
    )
    duration_minutes = serializers.ReadOnlyField()
    balance_due = serializers.ReadOnlyField()
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)
    service_mode_display = serializers.CharField(source='get_service_mode_display', read_only=True)
    provider_level_display = serializers.CharField(source='get_provider_level_display', read_only=True)
    shift_role_display = serializers.CharField(source='get_shift_role_display', read_only=True)
    rental_period_display = serializers.CharField(source='get_rental_period_display', read_only=True)
    shift_duration_display = serializers.CharField(source='get_shift_duration_display', read_only=True)
    shift_frequency_display = serializers.CharField(source='get_shift_frequency_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)

    class Meta:
        model = Booking
        fields = '__all__'


class ServiceCatalogItemSerializer(serializers.ModelSerializer):
    category_display = serializers.SerializerMethodField()

    class Meta:
        model = ServiceCatalogItem
        fields = [
            'id', 'category', 'category_display', 'name', 'caption',
            'price_min', 'price_max', 'price_text', 'sort_order',
            'is_active', 'created_at', 'updated_at',
        ]

    def get_category_display(self, obj):
        return CATEGORY_DISPLAY_MAP.get(obj.category, obj.category.replace('_', ' ').title())


class PublicServiceCatalogItemSerializer(serializers.ModelSerializer):
    category_display = serializers.SerializerMethodField()

    class Meta:
        model = ServiceCatalogItem
        fields = [
            'id', 'category', 'category_display', 'name', 'caption',
            'price_min', 'price_max', 'price_text',
        ]

    def get_category_display(self, obj):
        return CATEGORY_DISPLAY_MAP.get(obj.category, obj.category.replace('_', ' ').title())

