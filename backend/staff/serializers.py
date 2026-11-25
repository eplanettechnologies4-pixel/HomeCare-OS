import base64
import uuid
from django.core.files.base import ContentFile
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from homecareOS.permissions import get_user_role
import datetime
import re
import secrets
from django.conf import settings
from django.contrib.auth.hashers import make_password
from .models import (
    StaffMember, StaffRole, LeaveRequest, AttendanceRecord, Certification, FeedbackRating,
    ShiftTemplate, RosterWeek, RosterAssignment,
    StaffRequirementType, StaffRequirement, StaffDocument, StaffAssessment, StaffFeedback,
    StaffStageEvent, StaffActivationCode
)
from accounts.models import AuditLog


class Base64OrImageField(serializers.ImageField):
    """Allows uploading an image either as a standard file or a Base64 data URL."""
    def to_internal_value(self, data):
        if isinstance(data, str) and data.startswith('data:image'):
            try:
                header, imgstr = data.split(';base64,')
                ext = header.split('/')[-1]
                if ext == 'jpeg':
                    ext = 'jpg'
                file_name = f"{uuid.uuid4().hex[:10]}.{ext}"
                data = ContentFile(base64.b64decode(imgstr), name=file_name)
            except Exception as e:
                raise serializers.ValidationError(f"Invalid base64 image data: {str(e)}")
        elif data == '' or data is None:
            return None
        return super().to_internal_value(data)


class StaffSummarySerializer(serializers.ModelSerializer):
    """Minimal representation for embedding in other serializers."""
    full_name = serializers.ReadOnlyField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = StaffMember
        fields = [
            'id', 'full_name', 'employee_id', 'role', 'role_display',
            'specialization', 'phone', 'status', 'status_display', 'photo', 'rating'
        ]


class StaffListSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    employment_status_display = serializers.CharField(source='get_employment_status_display', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True, default='')
    last_login = serializers.DateTimeField(source='user.last_login', read_only=True, default=None)
    platform_allowed_display = serializers.CharField(source='get_platform_allowed_display', read_only=True)
    lifecycle_stage_display = serializers.SerializerMethodField()
    review_due = serializers.SerializerMethodField()
    docs_progress = serializers.SerializerMethodField()

    class Meta:
        model = StaffMember
        fields = [
            'id', 'full_name', 'first_name', 'last_name', 'employee_id',
            'role', 'role_display', 'specialization', 'designation', 'working_hours',
            'status', 'status_display', 'phone', 'email',
            'photo', 'id_card_front', 'id_card_back',
            'rating', 'hire_date', 'is_active',
            'username', 'last_login', 'platform_allowed', 'platform_allowed_display',
            'employment_status', 'employment_status_display', 'probation_end_date',
            'lifecycle_stage', 'lifecycle_stage_display', 'trainee_started_at',
            'probation_started_at', 'active_since', 'review_due', 'docs_progress',
        ]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get('request')
        actor = getattr(request, 'user', None) if request else None

        is_privileged = False
        is_self = False
        if actor and actor.is_authenticated:
            actor_role = get_user_role(actor)
            if actor_role in ('super_admin', 'admin', 'branch_manager') or getattr(actor, 'is_superuser', False):
                is_privileged = True
            if instance.user_id and instance.user_id == actor.id:
                is_self = True

        if not (is_privileged or is_self):
            ret.pop('employment_status', None)
            ret.pop('employment_status_display', None)
            ret.pop('probation_end_date', None)

        return ret

    def get_lifecycle_stage_display(self, obj):
        stage = getattr(obj, 'lifecycle_stage', None)
        if stage == 'trainee':
            return 'Trainee'
        elif stage == 'probation':
            return 'Probation'
        elif stage == 'active':
            return 'Active'
        return 'Not reviewed'

    def get_review_due(self, obj):
        if getattr(obj, 'lifecycle_stage', None) == 'probation' and obj.probation_end_date:
            days = (obj.probation_end_date - timezone.now().date()).days
            return days <= 14
        return False

    def get_docs_progress(self, obj):
        stage = getattr(obj, 'lifecycle_stage', None)
        if stage == 'trainee':
            gate = 'trainee_to_probation'
        elif stage == 'probation':
            gate = 'probation_to_active'
        else:
            return None
        try:
            total = obj.requirements.filter(requirement_type__gate=gate, requirement_type__is_active=True).count()
            if total == 0:
                return None
            completed = obj.requirements.filter(
                requirement_type__gate=gate,
                requirement_type__is_active=True,
                status__in=['verified', 'waived']
            ).count()
            return f"Docs {completed}/{total}"
        except Exception:
            return None


class StaffDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    employment_status_display = serializers.CharField(source='get_employment_status_display', read_only=True)
    photo = Base64OrImageField(required=False, allow_null=True)
    id_card_front = Base64OrImageField(required=False, allow_null=True)
    id_card_back = Base64OrImageField(required=False, allow_null=True)
    certifications = serializers.SerializerMethodField()
    recent_feedback = serializers.SerializerMethodField()
    attendance_summary = serializers.SerializerMethodField()

    class Meta:
        model = StaffMember
        fields = '__all__'

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get('request')
        actor = getattr(request, 'user', None) if request else None

        is_privileged = False
        is_self = False
        if actor and actor.is_authenticated:
            actor_role = get_user_role(actor)
            if actor_role in ('super_admin', 'admin', 'branch_manager') or getattr(actor, 'is_superuser', False):
                is_privileged = True
            if instance.user_id and instance.user_id == actor.id:
                is_self = True

        if not (is_privileged or is_self):
            ret.pop('employment_status', None)
            ret.pop('employment_status_display', None)
            ret.pop('probation_end_date', None)

        return ret

    def get_certifications(self, obj):
        return CertificationSerializer(obj.certifications.all(), many=True).data

    def get_recent_feedback(self, obj):
        return FeedbackRatingSerializer(obj.feedback_ratings.all()[:10], many=True).data

    def get_attendance_summary(self, obj):
        records = obj.attendance_records.all()[:30]
        return AttendanceRecordSerializer(records, many=True).data

    def validate(self, attrs):
        request = self.context.get('request')
        actor = getattr(request, 'user', None) if request else None
        instance = self.instance

        if instance and actor and actor.is_authenticated:
            actor_role = get_user_role(actor)
            is_actor_super_admin = (actor_role == 'super_admin') or getattr(actor, 'is_superuser', False)

            # Target staff user info
            target_user = instance.user
            target_is_admin_or_super = (
                instance.role in ('super_admin', 'admin') or
                (target_user and (
                    target_user.is_superuser or
                    target_user.is_staff or
                    get_user_role(target_user) in ('super_admin', 'admin')
                ))
            )

            new_role = attrs.get('role', instance.role)

            # 1. Nobody can change their own role
            if target_user and target_user == actor and new_role != instance.role:
                raise serializers.ValidationError({'role': ['You cannot change your own role.']})

            # 2. Only super_admin may edit a super_admin or admin account
            if target_is_admin_or_super and not is_actor_super_admin:
                raise PermissionDenied('Only Super Administrators can edit Super Admin or Admin accounts.')

            # 3. Only super_admin may assign or remove the roles super_admin and admin
            if new_role != instance.role:
                if (new_role in ('super_admin', 'admin') or instance.role in ('super_admin', 'admin')) and not is_actor_super_admin:
                    raise PermissionDenied('Only Super Administrators can assign or remove Admin or Super Admin roles.')

                # 4. admin (and branch_manager) may change only staff roles
                allowed_staff_roles = (
                    'nurse', 'doctor', 'physio', 'speech', 'psychologist',
                    'dietician', 'care_manager', 'accountant', 'crm_executive',
                    'lab_tech', 'delivery_rider'
                )
                if not is_actor_super_admin and new_role not in allowed_staff_roles:
                    raise PermissionDenied('You do not have permission to assign this role.')

            # 5. Employment status & probation end date: Writable ONLY by admin, super_admin, branch_manager.
            # Read-only for self and non-admins.
            status_in_attrs = 'employment_status' in attrs
            probation_in_attrs = 'probation_end_date' in attrs
            status_changed = status_in_attrs and (attrs['employment_status'] != (instance.employment_status or ''))
            probation_changed = probation_in_attrs and (attrs['probation_end_date'] != instance.probation_end_date)

            if status_changed or probation_changed:
                can_edit_hr = (actor_role in ('super_admin', 'admin', 'branch_manager')) or getattr(actor, 'is_superuser', False)

                if target_user and target_user == actor:
                    raise serializers.ValidationError({
                        'employment_status': ['You cannot edit your own employment status or probation date.']
                    })

                if not can_edit_hr:
                    raise PermissionDenied('Only Administrators and Branch Managers can update employment status.')

        return attrs

    def update(self, instance, validated_data):
        old_role = instance.role
        old_platform = instance.platform_allowed
        old_emp_status = instance.employment_status
        old_prob_date = instance.probation_end_date

        new_role = validated_data.get('role', old_role)
        new_platform = validated_data.get('platform_allowed', old_platform)
        new_emp_status = validated_data.get('employment_status', old_emp_status)
        new_prob_date = validated_data.get('probation_end_date', old_prob_date)

        updated_instance = super().update(instance, validated_data)

        # Audit log if role, platform_allowed, or employment status changed
        request = self.context.get('request')
        actor = getattr(request, 'user', None) if request else None
        changes = []
        if old_role != new_role:
            changes.append(f"Role changed from {old_role} to {new_role}")
        if old_platform != new_platform:
            changes.append(f"Platform allowed changed from {old_platform} to {new_platform}")
        if old_emp_status != new_emp_status:
            changes.append(f"Employment status changed from '{old_emp_status or 'not set'}' to '{new_emp_status or 'not set'}'")
        if old_prob_date != new_prob_date:
            changes.append(f"Probation end date changed from {old_prob_date} to {new_prob_date}")

        if changes:
            AuditLog.objects.create(
                actor=actor if (actor and actor.is_authenticated) else None,
                actor_name=actor.get_full_name() if (actor and actor.is_authenticated) else 'System Administrator',
                action='Staff Profile Updated',
                target_user=updated_instance.full_name,
                details=f"Staff ID {updated_instance.id} ({updated_instance.employee_id}): " + "; ".join(changes),
            )

        return updated_instance


class ShiftTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftTemplate
        fields = [
            'id', 'name', 'start_time', 'end_time', 'location',
            'color', 'is_off', 'is_active', 'created_at', 'updated_at'
        ]


class RosterAssignmentSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    staff_role = serializers.CharField(source='staff.role', read_only=True)
    buddy_name = serializers.CharField(source='buddy_staff.full_name', read_only=True, default='')

    class Meta:
        model = RosterAssignment
        fields = [
            'id', 'roster_week', 'staff', 'staff_name', 'staff_role',
            'date', 'shift_template', 'shift_name', 'start_time', 'end_time',
            'location', 'color', 'is_off', 'buddy_staff', 'buddy_name',
            'transport_driver_name', 'transport_driver_phone', 'transport_pickup_time',
            'revision', 'is_published', 'created_at', 'updated_at'
        ]


class RosterWeekSerializer(serializers.ModelSerializer):
    published_by_name = serializers.CharField(source='published_by.get_full_name', read_only=True, default='')

    class Meta:
        model = RosterWeek
        fields = [
            'id', 'week_start_date', 'status', 'revision',
            'published_at', 'published_by', 'published_by_name',
            'notes', 'created_at', 'updated_at'
        ]


class StaffCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for admin creating a new staff member.
    Creates both the Django User and the linked StaffMember in a single transaction.
    Sets unusable password, lifecycle_stage='trainee', seeds requirements, and returns one-time activation code.
    """
    username = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=3)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=8)
    first_name = serializers.CharField(required=True)
    last_name = serializers.CharField(required=True)
    role = serializers.ChoiceField(choices=StaffRole.choices, required=True)
    specialization = serializers.CharField(required=False, allow_blank=True, default='')
    phone = serializers.CharField(required=False, allow_blank=True, default='')
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    employee_id = serializers.CharField(required=False, allow_blank=True)
    hire_date = serializers.DateField(required=False)
    hourly_rate = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, default=0)
    photo = Base64OrImageField(required=False, allow_null=True)
    id_card_front = Base64OrImageField(required=False, allow_null=True)
    id_card_back = Base64OrImageField(required=False, allow_null=True)
    platform_allowed = serializers.ChoiceField(
        choices=StaffMember.PlatformAllowed.choices,
        required=False,
        default=StaffMember.PlatformAllowed.MOBILE
    )

    class Meta:
        model = StaffMember
        fields = [
            'id', 'username', 'password', 'password_confirm',
            'first_name', 'last_name', 'role', 'specialization',
            'phone', 'email', 'employee_id', 'hire_date', 'hourly_rate',
            'photo', 'id_card_front', 'id_card_back',
            'platform_allowed'
        ]

    def validate_first_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('First name is required.')
        return value.strip()

    def validate_last_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Last name is required.')
        return value.strip()

    def validate_username(self, value):
        if value:
            cleaned_username = value.strip()
            if User.objects.filter(username__iexact=cleaned_username).exists():
                raise serializers.ValidationError(f'Username "{cleaned_username}" is already taken. Please choose another username.')
            return cleaned_username
        return ''

    def validate(self, attrs):
        password = attrs.get('password')
        password_confirm = attrs.get('password_confirm')

        if password:
            if len(password) < 8:
                raise serializers.ValidationError({'password': 'Password must be at least 8 characters long.'})
            if password != password_confirm:
                raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})

        role = attrs.get('role')
        request = self.context.get('request')
        actor = getattr(request, 'user', None) if request else None
        actor_role = get_user_role(actor) if actor else ''
        is_actor_super = actor and ((actor_role == 'super_admin') or getattr(actor, 'is_superuser', False))

        if role in ('super_admin', 'admin'):
            if not is_actor_super:
                raise PermissionDenied('Only Super Administrators can create Admin or Super Admin accounts.')

        if actor and not is_actor_super:
            if actor_role == 'admin' and role == 'super_admin':
                raise PermissionDenied('Administrators cannot create Super Administrator accounts.')
            elif actor_role not in ('admin', 'super_admin'):
                raise PermissionDenied('Only Administrators and Super Administrators can create staff members.')

        return attrs

    def create(self, validated_data):
        username = validated_data.pop('username', '')
        password = validated_data.pop('password', None)
        validated_data.pop('password_confirm', None)

        first_name = validated_data.get('first_name', '').strip()
        last_name = validated_data.get('last_name', '').strip()
        role = validated_data.get('role', 'nurse')

        # Auto-generate unique username if not provided
        if not username:
            clean_fn = re.sub(r'[^a-zA-Z0-9]', '', first_name).lower()
            clean_ln = re.sub(r'[^a-zA-Z0-9]', '', last_name).lower()
            base_uname = f"{clean_fn}.{clean_ln}" if (clean_fn and clean_ln) else (clean_fn or clean_ln or "staff")
            candidate = base_uname
            idx = 1
            while User.objects.filter(username__iexact=candidate).exists():
                candidate = f"{base_uname}{idx}"
                idx += 1
            username = candidate

        email = validated_data.get('email') or f'{username}@homecare.local'

        # Auto-generate employee_id if not provided
        if not validated_data.get('employee_id'):
            prefix_map = {
                'nurse': 'N',
                'doctor': 'D',
                'physio': 'PT',
                'speech': 'ST',
                'psychologist': 'PSY',
                'dietician': 'DT',
                'care_manager': 'CM',
                'branch_manager': 'BM',
                'admin': 'ADM',
                'accountant': 'ACC',
                'crm_executive': 'CRM',
            }
            role_prefix = prefix_map.get(role, 'EMP')
            count = StaffMember.objects.count() + 1
            validated_data['employee_id'] = f'EMP-{role_prefix}-{count:03d}'

        # Set default hire_date if not provided
        if not validated_data.get('hire_date'):
            validated_data['hire_date'] = timezone.now().date()

        # Set platform_allowed default based on role if not provided
        if 'platform_allowed' not in validated_data:
            if role in ['admin', 'accountant', 'crm_executive', 'branch_manager']:
                validated_data['platform_allowed'] = StaffMember.PlatformAllowed.WEB
            elif role in ['care_manager']:
                validated_data['platform_allowed'] = StaffMember.PlatformAllowed.BOTH
            else:
                validated_data['platform_allowed'] = StaffMember.PlatformAllowed.MOBILE

        is_staff_user = role in ['admin', 'branch_manager']
        request = self.context.get('request')
        actor = getattr(request, 'user', None) if request else None

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=email,
                first_name=first_name,
                last_name=last_name,
                is_staff=is_staff_user,
            )
            # Staff user is created with an unusable password until activated
            user.set_unusable_password()
            user.save(update_fields=['password'])

            # Set lifecycle stage to trainee
            validated_data['lifecycle_stage'] = StaffMember.LifecycleStage.TRAINEE
            validated_data['trainee_started_at'] = timezone.now()
            prob_days = getattr(settings, 'STAFF_PROBATION_DEFAULT_DAYS', 90)
            validated_data['probation_end_date'] = (timezone.now() + datetime.timedelta(days=prob_days)).date()

            staff_member = StaffMember.objects.create(user=user, **validated_data)

            # Create requirement rows for all active requirement types
            active_types = StaffRequirementType.objects.filter(is_active=True).order_by('gate', 'sort_order', 'id')
            req_objects = [
                StaffRequirement(
                    staff=staff_member,
                    requirement_type=rt,
                    status=StaffRequirement.Status.PENDING
                )
                for rt in active_types
            ]
            StaffRequirement.objects.bulk_create(req_objects)

            # Generate one-time activation code (8-char unambiguous uppercase)
            charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
            code = ''.join(secrets.choice(charset) for _ in range(8))
            act_days = getattr(settings, 'STAFF_ACTIVATION_CODE_DAYS', 7)
            expires_at = timezone.now() + datetime.timedelta(days=act_days)

            StaffActivationCode.objects.create(
                staff=staff_member,
                code_hash=make_password(code),
                created_by=actor if (actor and actor.is_authenticated) else None,
                expires_at=expires_at,
            )

            # Attach temporary attributes so to_representation returns it once
            staff_member._one_time_activation_code = code
            staff_member._activation_expires_at = expires_at

            # AuditLog
            try:
                AuditLog.objects.create(
                    actor=actor if (actor and actor.is_authenticated) else None,
                    actor_name=getattr(actor, 'username', 'system') if actor else 'system',
                    action='Created Staff Trainee',
                    target_user=user.username,
                    details=f"Created staff member {staff_member.full_name} ({user.username}) as Trainee with activation code.",
                )
            except Exception:
                pass

        return staff_member

    def to_representation(self, instance):
        rep = StaffListSerializer(instance, context=self.context).data
        rep['username'] = instance.user.username if instance.user else None
        if hasattr(instance, '_one_time_activation_code'):
            rep['activation_code'] = instance._one_time_activation_code
            rep['activation_expires_at'] = instance._activation_expires_at.isoformat()
        return rep


class AttendanceRecordSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = '__all__'


class LeaveRequestSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    leave_type_display = serializers.CharField(source='get_leave_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = LeaveRequest
        fields = '__all__'


class CertificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certification
        fields = '__all__'


class FeedbackRatingSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)

    class Meta:
        model = FeedbackRating
        fields = '__all__'



# ── Staff Lifecycle & Onboarding Serializers ──────────────────────────────────

class StaffRequirementTypeSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    gate_display = serializers.CharField(source='get_gate_display', read_only=True)

    class Meta:
        model = StaffRequirementType
        fields = [
            'id', 'code', 'label', 'kind', 'kind_display',
            'gate', 'gate_display', 'required_count', 'sort_order',
            'is_active', 'requires_expiry'
        ]


class StaffDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True, default='')
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = StaffDocument
        fields = [
            'id', 'original_filename', 'stored_filename', 'content_type', 'size',
            'uploaded_by', 'uploaded_by_name', 'uploaded_at', 'expiry_date',
            'is_current', 'download_url'
        ]

    def get_download_url(self, obj):
        request = self.context.get('request')
        actor = getattr(request, 'user', None) if request else None
        if not actor or not actor.is_authenticated:
            return None
        actor_role = get_user_role(actor)
        is_admin_or_super = actor_role in ('super_admin', 'admin') or getattr(actor, 'is_superuser', False)
        is_self = obj.requirement.staff.user_id == actor.id
        is_sensitive = obj.requirement.requirement_type.code in ('blood_tests', 'police_verification')

        if is_sensitive:
            if not (is_admin_or_super or is_self):
                return None
        else:
            if not (is_admin_or_super or is_self):
                return None

        return f"/api/staff/documents/{obj.id}/download/"


class StaffAssessmentSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default='')

    class Meta:
        model = StaffAssessment
        fields = [
            'id', 'course_name', 'completed_date', 'exam_result', 'score',
            'exam_date', 'assessor', 'competency_passed', 'competency_date',
            'notes', 'lms_assignment', 'created_by_name', 'created_at'
        ]


class StaffFeedbackSerializer(serializers.ModelSerializer):
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    entered_by_name = serializers.CharField(source='entered_by.get_full_name', read_only=True, default='')
    patient_name = serializers.CharField(source='patient.full_name', read_only=True, default='')

    class Meta:
        model = StaffFeedback
        fields = [
            'id', 'source', 'source_display', 'rating', 'comment',
            'entered_by', 'entered_by_name', 'patient', 'patient_name', 'created_at'
        ]


class StaffRequirementSerializer(serializers.ModelSerializer):
    requirement_type = StaffRequirementTypeSerializer(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True, default='')
    waived_by_name = serializers.CharField(source='waived_by.get_full_name', read_only=True, default='')
    documents = serializers.SerializerMethodField()
    assessments = StaffAssessmentSerializer(many=True, read_only=True)
    feedbacks = StaffFeedbackSerializer(many=True, read_only=True)

    class Meta:
        model = StaffRequirement
        fields = [
            'id', 'requirement_type', 'status', 'status_display',
            'verified_by', 'verified_by_name', 'verified_at',
            'rejection_reason', 'waived_by', 'waived_by_name', 'waiver_reason',
            'notes', 'documents', 'assessments', 'feedbacks',
            'created_at', 'updated_at'
        ]

    def get_documents(self, obj):
        docs = obj.documents.filter(is_current=True)
        return StaffDocumentSerializer(docs, many=True, context=self.context).data


class StaffStageEventSerializer(serializers.ModelSerializer):
    decided_by_name = serializers.CharField(source='decided_by.get_full_name', read_only=True, default='')

    class Meta:
        model = StaffStageEvent
        fields = [
            'id', 'from_stage', 'to_stage', 'decided_by', 'decided_by_name',
            'decided_at', 'note'
        ]
