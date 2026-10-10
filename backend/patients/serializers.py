from django.utils import timezone
from rest_framework import serializers
from .models import Patient, Prescription, VitalSign, NurseNote, LabResult, DailyReport, ReportPhoto, MARAdministration


class PatientSummarySerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    age = serializers.ReadOnlyField()
    care_manager_name = serializers.CharField(source='assigned_care_manager.full_name', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)

    class Meta:
        model = Patient
        fields = [
            'id', 'mr_number', 'full_name', 'age', 'gender',
            'primary_diagnosis', 'care_manager_name', 'is_active',
            'source', 'source_display',
        ]


class PatientListSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    age = serializers.ReadOnlyField()
    care_manager_name = serializers.CharField(source='assigned_care_manager.full_name', read_only=True)
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)
    has_portal_account = serializers.SerializerMethodField()
    portal_username = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)

    class Meta:
        model = Patient
        fields = [
            'id', 'mr_number', 'full_name', 'first_name', 'last_name',
            'age', 'date_of_birth', 'gender', 'gender_display',
            'primary_diagnosis', 'care_manager_name', 'phone',
            'address', 'latitude', 'longitude', 'is_active',
            'source', 'source_display',
            'has_portal_account', 'portal_username',
        ]

    def get_has_portal_account(self, obj):
        return obj.portal_user_id is not None

    def get_portal_username(self, obj):
        return obj.portal_user.username if obj.portal_user_id else None


class PatientDetailSerializer(serializers.ModelSerializer):
    mr_number = serializers.CharField(required=False, allow_blank=True)
    full_name = serializers.ReadOnlyField()
    age = serializers.ReadOnlyField()
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    care_manager_name = serializers.CharField(source='assigned_care_manager.full_name', read_only=True)
    active_prescriptions = serializers.SerializerMethodField()
    recent_vitals = serializers.SerializerMethodField()
    has_portal_account = serializers.SerializerMethodField()
    portal_username = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = '__all__'

    def create(self, validated_data):
        from django.utils import timezone
        mr = validated_data.get('mr_number')
        if not mr or Patient.objects.filter(mr_number=mr).exists():
            year = timezone.now().year
            count = Patient.objects.count() + 1
            candidate = f"MR-{year}-{count:04d}"
            while Patient.objects.filter(mr_number=candidate).exists():
                count += 1
                candidate = f"MR-{year}-{count:04d}"
            validated_data['mr_number'] = candidate

        return super().create(validated_data)

    def get_active_prescriptions(self, obj):
        return PrescriptionSerializer(obj.prescriptions.all()[:5], many=True).data

    def get_recent_vitals(self, obj):
        return VitalSignSerializer(obj.vitals.all()[:5], many=True).data

    def get_has_portal_account(self, obj):
        return obj.portal_user_id is not None

    def get_portal_username(self, obj):
        return obj.portal_user.username if obj.portal_user_id else None


class PrescriptionSerializer(serializers.ModelSerializer):
    # Aliased read/write fields
    drug_name = serializers.CharField(source='medication', required=False)
    start_date = serializers.DateField(source='date', required=False)
    days_prescribed = serializers.IntegerField(source='duration_days', required=False, allow_null=True)
    duration = serializers.IntegerField(source='duration_days', required=False, allow_null=True, write_only=True)
    prescription_file = serializers.FileField(source='document', required=False, allow_null=True)

    # Extra metadata
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    file_url = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = Prescription
        fields = [
            'id', 'patient', 'patient_name', 'booking', 'prescribed_by',
            'medication', 'drug_name', 'dosage', 'frequency', 'route',
            'duration_days', 'days_prescribed', 'duration', 'date', 'start_date',
            'notes', 'document', 'prescription_file', 'file_url',
            'uploaded_by', 'uploaded_by_name', 'created_at', 'is_active',
        ]
        read_only_fields = ['id', 'created_at', 'uploaded_by_name', 'patient_name', 'file_url', 'is_active']
        extra_kwargs = {
            'patient': {'required': False},
            'medication': {'required': False},
            'date': {'required': False},
            'prescribed_by': {'required': False},
            'dosage': {'required': False},
            'frequency': {'required': False},
        }

    def to_internal_value(self, data):
        # Convert QueryDict (from multipart) to mutable dict if necessary
        if hasattr(data, 'dict'):
            parsed = data.dict()
        else:
            parsed = dict(data)

        # Normalize aliased inputs
        if 'drug_name' in parsed and 'medication' not in parsed:
            parsed['medication'] = parsed['drug_name']
        if 'start_date' in parsed and 'date' not in parsed:
            parsed['date'] = parsed['start_date']
        if 'days_prescribed' in parsed and 'duration_days' not in parsed:
            parsed['duration_days'] = parsed['days_prescribed']
        elif 'duration' in parsed and 'duration_days' not in parsed:
            parsed['duration_days'] = parsed['duration']
        if 'prescription_file' in parsed and 'document' not in parsed:
            parsed['document'] = parsed['prescription_file']

        # Ensure date and clinician fallbacks
        if not parsed.get('date'):
            parsed['date'] = timezone.now().date().isoformat()
        if not parsed.get('prescribed_by'):
            parsed['prescribed_by'] = 'Attending Physician'
        if not parsed.get('medication'):
            parsed['medication'] = 'Prescription Document' if (parsed.get('document') or parsed.get('prescription_file')) else 'Unspecified Medication'
        if not parsed.get('dosage'):
            parsed['dosage'] = 'As Prescribed'
        if not parsed.get('frequency'):
            parsed['frequency'] = 'As Directed'

        return super().to_internal_value(parsed)

    def get_file_url(self, obj):
        if obj.document:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.document.url)
            return obj.document.url
        return None

    def get_is_active(self, obj):
        if not obj.date:
            return True
        if not obj.duration_days:
            return True
        from datetime import timedelta
        expiry = obj.date + timedelta(days=obj.duration_days)
        return timezone.now().date() <= expiry


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

