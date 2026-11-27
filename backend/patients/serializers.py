from django.utils import timezone
from rest_framework import serializers
from .models import (
    Patient, Prescription, VitalSign, NurseNote, LabResult,
    DailyReport, ReportPhoto, MARAdministration,
    PatientActiveComplaint, ScheduledItem, ShiftHandoverNote,
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

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if ret.get('is_file_locked'):
            ret['primary_diagnosis'] = 'Locked — Enter Duty PIN'
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if not user or not user.is_authenticated:
            return ret

        from homecareOS.permissions import get_user_role
        role = get_user_role(user)

        clinical_fields = [
            'primary_diagnosis',
            'secondary_diagnoses',
            'allergies',
            'allergy_status',
            'blood_type',
            'brief_history',
            'care_plan',
            'history_care_plan_edits',
            'active_prescriptions',
            'recent_vitals',
        ]

        # 1. Non-clinical roles: accountant, crm_executive (demographic, billing, CRM fields ONLY)
        if role in ('accountant', 'crm_executive'):
            for f in clinical_fields:
                ret.pop(f, None)
            ret.pop('emergency_contact_phone', None)
            return ret

        # 2. Patient / Family owner
        if role in ('patient_family', 'family') or (hasattr(user, 'patient_profile') and not hasattr(user, 'staffmember')):
            return ret

        # 3. Super admin, admin, branch manager
        if user.is_superuser or role in ('super_admin', 'admin', 'branch_manager'):
            return ret

        # 4. Clinicians and care managers
        from homecareOS.clinician_permissions import get_guardian_contact_visibility
        from patients.scoping import get_assigned_patient_ids_for_clinician

        assigned_ids = get_assigned_patient_ids_for_clinician(user)
        is_assigned = (assigned_ids is None) or (instance.id in assigned_ids)

        if not is_assigned and role != 'care_manager':
            for f in clinical_fields:
                ret.pop(f, None)

        # Guardian phone visibility
        vis = get_guardian_contact_visibility(user, instance)
        if vis != 'direct':
            ret.pop('emergency_contact_phone', None)

        return ret


class PatientListSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    age = serializers.ReadOnlyField()
    care_manager_name = serializers.CharField(source='assigned_care_manager.full_name', read_only=True)
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)
    has_portal_account = serializers.SerializerMethodField()
    portal_username = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    photo = serializers.SerializerMethodField()
    is_file_locked = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'id', 'mr_number', 'patient_code', 'full_name', 'first_name', 'last_name',
            'age', 'date_of_birth', 'gender', 'gender_display',
            'primary_diagnosis', 'care_manager_name', 'phone', 'photo',
            'address', 'latitude', 'longitude', 'is_active',
            'source', 'source_display',
            'has_portal_account', 'portal_username',
            'is_file_locked',
        ]

    def get_is_file_locked(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        from staff.pin_service import is_patient_unlocked_for_user
        unlocked, _ = is_patient_unlocked_for_user(user, obj.id)
        return not unlocked

    def get_photo(self, obj):
        if obj.photo:
            return f"/api/patients/{obj.id}/photo/"
        return None

    def get_has_portal_account(self, obj):
        return obj.portal_user_id is not None

    def get_portal_username(self, obj):
        return obj.portal_user.username if obj.portal_user_id else None

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if ret.get('is_file_locked'):
            ret['primary_diagnosis'] = 'Locked — Enter Duty PIN'
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if not user or not user.is_authenticated:
            return ret

        from homecareOS.permissions import get_user_role
        role = get_user_role(user)

        clinical_fields = [
            'primary_diagnosis',
            'secondary_diagnoses',
            'allergies',
            'allergy_status',
            'blood_type',
            'brief_history',
            'care_plan',
            'history_care_plan_edits',
            'active_prescriptions',
            'recent_vitals',
        ]

        # 1. Non-clinical roles: accountant, crm_executive (demographic, billing, CRM fields ONLY)
        if role in ('accountant', 'crm_executive'):
            for f in clinical_fields:
                ret.pop(f, None)
            ret.pop('emergency_contact_phone', None)
            return ret

        # 2. Patient / Family owner
        if role in ('patient_family', 'family') or (hasattr(user, 'patient_profile') and not hasattr(user, 'staffmember')):
            return ret

        # 3. Super admin, admin, branch manager
        if user.is_superuser or role in ('super_admin', 'admin', 'branch_manager'):
            return ret

        # 4. Clinicians and care managers
        from homecareOS.clinician_permissions import get_guardian_contact_visibility
        from patients.scoping import get_assigned_patient_ids_for_clinician

        assigned_ids = get_assigned_patient_ids_for_clinician(user)
        is_assigned = (assigned_ids is None) or (instance.id in assigned_ids)

        if not is_assigned and role != 'care_manager':
            for f in clinical_fields:
                ret.pop(f, None)

        # Guardian phone visibility
        vis = get_guardian_contact_visibility(user, instance)
        if vis != 'direct':
            ret.pop('emergency_contact_phone', None)

        return ret


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
            'brief_history', 'care_plan', 'history_care_plan_edits', 'photo',
            'allergy_status',
        ]

    def validate(self, attrs):
        cm = attrs.get('assigned_care_manager')
        if cm and getattr(cm, 'lifecycle_stage', None) == 'trainee':
            raise serializers.ValidationError({
                'assigned_care_manager': f"Staff member {cm.full_name} is currently a Trainee and cannot be assigned as a care manager."
            })
        return attrs

    def create(self, validated_data):
        from django.utils import timezone
        for field in ('brief_history', 'care_plan', 'history_care_plan_edits', 'photo', 'allergy_status'):
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
        for field in ('brief_history', 'care_plan', 'history_care_plan_edits', 'photo', 'allergy_status'):
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

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if ret.get('is_file_locked'):
            ret['primary_diagnosis'] = 'Locked — Enter Duty PIN'
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if not user or not user.is_authenticated:
            return ret

        from homecareOS.permissions import get_user_role
        role = get_user_role(user)

        clinical_fields = [
            'primary_diagnosis',
            'secondary_diagnoses',
            'allergies',
            'allergy_status',
            'blood_type',
            'brief_history',
            'care_plan',
            'history_care_plan_edits',
            'active_prescriptions',
            'recent_vitals',
        ]

        # 1. Non-clinical roles: accountant, crm_executive (demographic, billing, CRM fields ONLY)
        if role in ('accountant', 'crm_executive'):
            for f in clinical_fields:
                ret.pop(f, None)
            ret.pop('emergency_contact_phone', None)
            return ret

        # 2. Patient / Family owner
        if role in ('patient_family', 'family') or (hasattr(user, 'patient_profile') and not hasattr(user, 'staffmember')):
            return ret

        # 3. Super admin, admin, branch manager
        if user.is_superuser or role in ('super_admin', 'admin', 'branch_manager'):
            return ret

        # 4. Clinicians and care managers
        from homecareOS.clinician_permissions import get_guardian_contact_visibility
        from patients.scoping import get_assigned_patient_ids_for_clinician

        assigned_ids = get_assigned_patient_ids_for_clinician(user)
        is_assigned = (assigned_ids is None) or (instance.id in assigned_ids)

        if not is_assigned and role != 'care_manager':
            for f in clinical_fields:
                ret.pop(f, None)

        # Guardian phone visibility
        vis = get_guardian_contact_visibility(user, instance)
        if vis != 'direct':
            ret.pop('emergency_contact_phone', None)

        return ret


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

    # Authorship, verification and audit fields
    entered_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    status_changed_by_name = serializers.SerializerMethodField()
    can_administer = serializers.SerializerMethodField()

    class Meta:
        model = Prescription
        fields = [
            'id', 'patient', 'patient_name', 'booking', 'prescribed_by',
            'medication', 'drug_name', 'dosage', 'frequency', 'route',
            'duration_days', 'days_prescribed', 'duration', 'date', 'start_date',
            'notes', 'document', 'prescription_file', 'file_url',
            'uploaded_by', 'uploaded_by_name', 'created_at', 'is_active',
            'entry_mode', 'entered_by', 'entered_by_name',
            'ordering_doctor', 'ordering_doctor_name', 'order_source',
            'verification_status', 'verified_by', 'verified_by_name', 'verified_at',
            'verification_note', 'status_reason', 'status_changed_by',
            'status_changed_by_name', 'status_changed_at', 'can_administer',
        ]
        read_only_fields = [
            'id', 'created_at', 'uploaded_by_name', 'patient_name', 'file_url', 'is_active',
            'entered_by_name', 'verified_by_name', 'status_changed_by_name', 'can_administer',
        ]
        extra_kwargs = {
            'patient': {'required': False},
            'medication': {'required': False},
            'date': {'required': False},
            'prescribed_by': {'required': False},
            'dosage': {'required': False},
            'frequency': {'required': False},
            'ordering_doctor_name': {'required': False},
            'order_source': {'required': False},
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
        if not parsed.get('ordering_doctor_name') and parsed.get('prescribed_by'):
            parsed['ordering_doctor_name'] = parsed['prescribed_by']
        if not parsed.get('prescribed_by'):
            parsed['prescribed_by'] = parsed.get('ordering_doctor_name') or 'Attending Physician'
        if not parsed.get('medication'):
            parsed['medication'] = 'Prescription Document' if (parsed.get('document') or parsed.get('prescription_file')) else 'Unspecified Medication'
        if not parsed.get('dosage'):
            parsed['dosage'] = 'As Prescribed'
        if not parsed.get('frequency'):
            parsed['frequency'] = 'As Directed'
        if not parsed.get('order_source'):
            parsed['order_source'] = 'written'

        return super().to_internal_value(parsed)

    def get_file_url(self, obj):
        if obj.document:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.document.url)
            return obj.document.url
        return None

    def get_is_active(self, obj):
        if obj.verification_status in ('discontinued', 'rejected', 'cancelled'):
            return False
        if not obj.date:
            return True
        if not obj.duration_days:
            return True
        from datetime import timedelta
        expiry = obj.date + timedelta(days=obj.duration_days)
        return timezone.now().date() <= expiry

    def get_entered_by_name(self, obj):
        if not obj.entered_by:
            return None
        return obj.entered_by.get_full_name() or obj.entered_by.username

    def get_verified_by_name(self, obj):
        if not obj.verified_by:
            return None
        return obj.verified_by.get_full_name() or obj.verified_by.username

    def get_status_changed_by_name(self, obj):
        if not obj.status_changed_by:
            return None
        return obj.status_changed_by.get_full_name() or obj.status_changed_by.username

    def get_can_administer(self, obj):
        from django.conf import settings
        admin_before_verification = getattr(settings, 'PRESCRIPTION_ADMIN_BEFORE_VERIFICATION', False)
        if obj.verification_status in ('rejected', 'cancelled', 'discontinued'):
            return False
        if obj.verification_status == 'pending_verification' and not admin_before_verification:
            return False
        return True


class VitalSignSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.full_name', read_only=True)
    entered_in_error_by_name = serializers.CharField(source='entered_in_error_by.get_full_name', read_only=True, default='')
    recorded_at = serializers.DateTimeField(required=False)
    visit_highlighted = serializers.SerializerMethodField()

    class Meta:
        model = VitalSign
        fields = '__all__'

    def get_visit_highlighted(self, obj):
        if obj.recorded_outside_visit or not obj.recorded_by_id or not obj.patient_id or not obj.recorded_at:
            return False
        from django.db.models import Q
        from staff_portal.models import NurseVisit
        return NurseVisit.objects.filter(
            nurse_id=obj.recorded_by_id,
            patient_id=obj.patient_id,
            checkin_time__lte=obj.recorded_at,
        ).filter(
            Q(checkout_time__isnull=True) | Q(checkout_time__gte=obj.recorded_at)
        ).exists()

    def validate_recorded_at(self, value):
        if value and value > timezone.now():
            raise serializers.ValidationError("Future-dated observations cannot be recorded.")
        return value


class NurseNoteSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.full_name', read_only=True)
    entered_in_error_by_name = serializers.CharField(source='entered_in_error_by.get_full_name', read_only=True, default='')

    class Meta:
        model = NurseNote
        fields = '__all__'


class LabResultSerializer(serializers.ModelSerializer):
    entered_in_error_by_name = serializers.CharField(source='entered_in_error_by.get_full_name', read_only=True, default='')

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
    administered_by_initials = serializers.SerializerMethodField()
    medication_name = serializers.CharField(source='prescription.medication', read_only=True)
    entered_in_error_by_name = serializers.CharField(source='entered_in_error_by.get_full_name', read_only=True, default='')
    day_name = serializers.SerializerMethodField()
    is_provisional = serializers.SerializerMethodField()

    class Meta:
        model = MARAdministration
        fields = [
            'id', 'prescription', 'medication_name',
            'day_number', 'day_name',
            'slot_time', 'status', 'reason', 'dose_given', 'route', 'notes',
            'administered_by', 'administered_by_name', 'administered_by_initials', 'administered_at',
            'is_provisional',
            'is_entered_in_error', 'entered_in_error_by', 'entered_in_error_by_name',
            'entered_in_error_at', 'entered_in_error_reason',
        ]
        read_only_fields = [
            'id', 'administered_by', 'administered_by_name', 'administered_by_initials', 'administered_at', 'is_provisional',
            'is_entered_in_error', 'entered_in_error_by', 'entered_in_error_by_name',
            'entered_in_error_at', 'entered_in_error_reason',
        ]

    def get_administered_by_initials(self, obj):
        if not obj.administered_by:
            return ''
        name = obj.administered_by.full_name or ''
        parts = [p[0].upper() for p in name.split() if p]
        return ''.join(parts[:3]) or 'RN'


    def get_is_provisional(self, obj):
        if obj.prescription and getattr(obj.prescription, 'verification_status', None) == 'pending_verification':
            return True
        return False

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
    entered_in_error_by_name = serializers.CharField(source='entered_in_error_by.get_full_name', read_only=True, default='')
    due_relative = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = ScheduledItem
        fields = [
            'id', 'patient', 'kind', 'title', 'due_at', 'due_relative', 'is_overdue',
            'notes', 'status', 'created_by', 'created_by_name', 'created_at',
            'done_at', 'done_by', 'done_by_name',
            'staff_request', 'booking', 'lab_order',
            'is_entered_in_error', 'entered_in_error_by', 'entered_in_error_by_name',
            'entered_in_error_at', 'entered_in_error_reason',
        ]
        read_only_fields = [
            'created_by', 'created_at', 'done_at', 'done_by',
            'is_entered_in_error', 'entered_in_error_by', 'entered_in_error_by_name',
            'entered_in_error_at', 'entered_in_error_reason',
        ]


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


class ShiftHandoverNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mr = serializers.CharField(source='patient.mr_number', read_only=True)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = ShiftHandoverNote
        fields = [
            'id', 'patient', 'patient_name', 'patient_mr', 'author', 'author_name',
            'shift_label', 'shift_date', 'text', 'created_at', 'updated_at',
            'is_entered_in_error', 'entered_in_error_by', 'entered_in_error_at', 'entered_in_error_reason',
            'can_edit',
        ]
        read_only_fields = [
            'id', 'author', 'author_name', 'created_at', 'updated_at',
            'is_entered_in_error', 'entered_in_error_by', 'entered_in_error_at', 'entered_in_error_reason',
            'can_edit',
        ]

    def get_author_name(self, obj):
        if obj.author:
            return obj.author.get_full_name() or obj.author.username
        return 'Staff Nurse'

    def get_can_edit(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        if obj.is_entered_in_error:
            return False
        if obj.author_id != request.user.id:
            return False
        return obj.is_within_edit_window()


