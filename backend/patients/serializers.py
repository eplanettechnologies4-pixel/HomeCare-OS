from django.utils import timezone
from rest_framework import serializers
from .models import (
    Patient, Prescription, VitalSign, NurseNote, LabResult,
    DailyReport, ReportPhoto, MARAdministration,
    PatientActiveComplaint, ScheduledItem,
)


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
    photo = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'id', 'mr_number', 'patient_code', 'full_name', 'first_name', 'last_name',
            'age', 'date_of_birth', 'gender', 'gender_display',
            'primary_diagnosis', 'care_manager_name', 'phone', 'photo',
            'address', 'latitude', 'longitude', 'is_active',
            'source', 'source_display',
            'has_portal_account', 'portal_username',
        ]

    def get_photo(self, obj):
        if obj.photo:
            return f"/api/patients/{obj.id}/photo/"
        return None

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
    photo = serializers.SerializerMethodField()
    brief_history = serializers.CharField(read_only=True)
    care_plan = serializers.CharField(read_only=True)
    history_care_plan_edits = serializers.JSONField(read_only=True)

    class Meta:
        model = Patient
        fields = '__all__'
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'brief_history', 'care_plan', 'history_care_plan_edits', 'photo'
        ]

    def create(self, validated_data):
        from django.utils import timezone
        for field in ('brief_history', 'care_plan', 'history_care_plan_edits', 'photo'):
            validated_data.pop(field, None)

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

    def update(self, instance, validated_data):
        for field in ('brief_history', 'care_plan', 'history_care_plan_edits', 'photo'):
            validated_data.pop(field, None)
        return super().update(instance, validated_data)

    def get_photo(self, obj):
        if obj.photo:
            return f"/api/patients/{obj.id}/photo/"
        return None

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
        try:
            day_idx = int(obj.day_number)
            days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            if 0 <= day_idx < len(days):
                return days[day_idx]
            return f"Day {day_idx}"
        except Exception:
            return str(obj.day_number)


class PatientActiveComplaintSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default='')
    resolved_by_name = serializers.CharField(source='resolved_by.get_full_name', read_only=True, default='')
    is_resolved = serializers.SerializerMethodField()

    class Meta:
        model = PatientActiveComplaint
        fields = [
            'id', 'patient', 'text',
            'created_by', 'created_by_name', 'created_at',
            'resolved_by', 'resolved_by_name', 'resolved_at',
            'is_resolved',
        ]
        read_only_fields = ['created_by', 'created_at', 'resolved_by', 'resolved_at']

    def get_is_resolved(self, obj):
        return bool(obj.resolved_at)


class ScheduledItemSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default='')
    done_by_name = serializers.CharField(source='done_by.get_full_name', read_only=True, default='')
    due_relative = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = ScheduledItem
        fields = [
            'id', 'patient', 'kind', 'title', 'due_at', 'due_relative', 'is_overdue',
            'notes', 'status', 'created_by', 'created_by_name', 'created_at',
            'done_at', 'done_by', 'done_by_name',
            'staff_request', 'booking', 'lab_order'
        ]
        read_only_fields = ['created_by', 'created_at', 'done_at', 'done_by']

    def get_due_relative(self, obj):
        from zoneinfo import ZoneInfo
        from django.conf import settings
        tz = ZoneInfo(getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi'))
        now_local = timezone.now().astimezone(tz)
        due_local = obj.due_at.astimezone(tz)

        today_local = now_local.date()
        due_date = due_local.date()
        diff_days = (due_date - today_local).days

        if obj.status == ScheduledItem.Status.DONE:
            return 'Completed'
        if obj.status == ScheduledItem.Status.CANCELLED:
            return 'Cancelled'

        if diff_days < 0:
            if diff_days == -1:
                return 'Overdue (Yesterday)'
            return f'Overdue ({abs(diff_days)} days ago)'
        elif diff_days == 0:
            return 'Today'
        elif diff_days == 1:
            return 'Tomorrow'
        elif diff_days <= 6:
            return f'In {diff_days} days'
        elif diff_days <= 13:
            return 'Next week'
        elif diff_days <= 30:
            return f'In {diff_days // 7} weeks'
        elif diff_days <= 90:
            return f'In {diff_days // 30} months'
        else:
            return f'In {diff_days // 30} months'

    def get_is_overdue(self, obj):
        if obj.status in [ScheduledItem.Status.DONE, ScheduledItem.Status.CANCELLED]:
            return False
        return obj.due_at < timezone.now()


