from rest_framework import serializers
from .models import Patient, Prescription, VitalSign, NurseNote, LabResult, DailyReport, ReportPhoto, MARAdministration


class PatientSummarySerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    age = serializers.ReadOnlyField()
    care_manager_name = serializers.CharField(source='assigned_care_manager.full_name', read_only=True)

    class Meta:
        model = Patient
        fields = ['id', 'mr_number', 'full_name', 'age', 'gender', 'primary_diagnosis', 'care_manager_name', 'is_active']


class PatientListSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    age = serializers.ReadOnlyField()
    care_manager_name = serializers.CharField(source='assigned_care_manager.full_name', read_only=True)
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)

    class Meta:
        model = Patient
        fields = [
            'id', 'mr_number', 'full_name', 'first_name', 'last_name',
            'age', 'date_of_birth', 'gender', 'gender_display',
            'primary_diagnosis', 'care_manager_name', 'phone',
            'address', 'latitude', 'longitude', 'is_active',
        ]


class PatientDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    age = serializers.ReadOnlyField()
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)
    care_manager_name = serializers.CharField(source='assigned_care_manager.full_name', read_only=True)
    active_prescriptions = serializers.SerializerMethodField()
    recent_vitals = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = '__all__'

    def get_active_prescriptions(self, obj):
        return PrescriptionSerializer(obj.prescriptions.all()[:5], many=True).data

    def get_recent_vitals(self, obj):
        return VitalSignSerializer(obj.vitals.all()[:5], many=True).data


class PrescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prescription
        fields = '__all__'


class VitalSignSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.full_name', read_only=True)

    class Meta:
        model = VitalSign
        fields = '__all__'


class NurseNoteSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.full_name', read_only=True)

    class Meta:
        model = NurseNote
        fields = '__all__'


class LabResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabResult
        fields = '__all__'


# ── Mobile serializers ────────────────────────────────────────────────────────

class ReportPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportPhoto
        fields = ['id', 'image', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at']


class DailyReportSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(source='submitted_by.full_name', read_only=True)
    photos = ReportPhotoSerializer(many=True, read_only=True)
    nurse_note_id = serializers.PrimaryKeyRelatedField(source='nurse_note', read_only=True)

    class Meta:
        model = DailyReport
        fields = [
            'id', 'patient', 'booking', 'submitted_by', 'submitted_by_name',
            'care_items_checked', 'notes', 'photos', 'nurse_note_id', 'created_at',
        ]
        read_only_fields = ['id', 'submitted_by', 'submitted_by_name', 'nurse_note_id', 'created_at']


class MARAdministrationSerializer(serializers.ModelSerializer):
    administered_by_name = serializers.CharField(source='administered_by.full_name', read_only=True)
    medication_name = serializers.CharField(source='prescription.medication', read_only=True)
    day_name = serializers.SerializerMethodField()

    class Meta:
        model = MARAdministration
        fields = [
            'id', 'prescription', 'medication_name',
            'day_number', 'day_name',
            'administered_by', 'administered_by_name', 'administered_at',
        ]
        read_only_fields = ['id', 'administered_by', 'administered_by_name', 'administered_at']

    def get_day_name(self, obj):
        return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][obj.day_number]

