from rest_framework import serializers
from .models import LabTest, LabOrder, LabReport
from patients.serializers import PatientSummarySerializer
from staff.serializers import StaffSummarySerializer


class LabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabTest
        fields = [
            'id', 'name', 'price', 'sample_type', 'turnaround_hours',
            'description', 'preparation_instructions', 'is_active',
            'created_at', 'updated_at'
        ]


class LabReportSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)

    class Meta:
        model = LabReport
        fields = [
            'id', 'lab_order', 'result_file', 'result_data',
            'uploaded_by', 'uploaded_by_name', 'flagged_abnormal',
            'clinical_remarks', 'uploaded_at'
        ]


class LabOrderListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mr = serializers.CharField(source='patient.mr_number', read_only=True)
    collection_staff_name = serializers.CharField(source='collection_staff.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    tests = LabTestSerializer(many=True, read_only=True)
    tests_summary = serializers.SerializerMethodField()
    has_report = serializers.SerializerMethodField()

    class Meta:
        model = LabOrder
        fields = [
            'id', 'patient', 'patient_name', 'patient_mr',
            'tests', 'tests_summary', 'status', 'status_display',
            'collection_staff', 'collection_staff_name',
            'scheduled_collection_time', 'collected_at',
            'collection_latitude', 'collection_longitude',
            'collection_address', 'total_price', 'fasting_required',
            'has_report', 'created_at'
        ]

    def get_tests_summary(self, obj):
        return ", ".join([t.name for t in obj.tests.all()])

    def get_has_report(self, obj):
        return obj.reports.exists()


class LabOrderDetailSerializer(serializers.ModelSerializer):
    patient = PatientSummarySerializer(read_only=True)
    collection_staff = StaffSummarySerializer(read_only=True)
    tests = LabTestSerializer(many=True, read_only=True)
    reports = LabReportSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = LabOrder
        fields = [
            'id', 'patient', 'tests', 'status', 'status_display',
            'collection_staff', 'scheduled_collection_time', 'collected_at',
            'collection_latitude', 'collection_longitude', 'collection_notes',
            'collection_address', 'total_price', 'fasting_required',
            'notes', 'reports', 'created_at', 'updated_at'
        ]
