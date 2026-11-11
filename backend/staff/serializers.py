import base64
import uuid
from django.core.files.base import ContentFile
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from homecareOS.permissions import get_user_role
from .models import (
    StaffMember, StaffRole, LeaveRequest, AttendanceRecord, Certification, FeedbackRating,
    ShiftTemplate, RosterWeek, RosterAssignment
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
    username = serializers.CharField(source='user.username', read_only=True, default='')
    last_login = serializers.DateTimeField(source='user.last_login', read_only=True, default=None)
    platform_allowed_display = serializers.CharField(source='get_platform_allowed_display', read_only=True)

    class Meta:
        model = StaffMember
        fields = [
            'id', 'full_name', 'first_name', 'last_name', 'employee_id',
            'role', 'role_display', 'specialization', 'designation', 'working_hours',
            'status', 'status_display', 'phone', 'email',
            'photo', 'id_card_front', 'id_card_back',
            'rating', 'hire_date', 'is_active',
            'username', 'last_login', 'platform_allowed', 'platform_allowed_display',
        ]


class StaffDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    photo = Base64OrImageField(required=False, allow_null=True)
    id_card_front = Base64OrImageField(required=False, allow_null=True)
    id_card_back = Base64OrImageField(required=False, allow_null=True)
    certifications = serializers.SerializerMethodField()
    recent_feedback = serializers.SerializerMethodField()
    attendance_summary = serializers.SerializerMethodField()

    class Meta:
        model = StaffMember
        fields = '__all__'

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

        return attrs

    def update(self, instance, validated_data):
        old_role = instance.role
        old_platform = instance.platform_allowed
        new_role = validated_data.get('role', old_role)
        new_platform = validated_data.get('platform_allowed', old_platform)

        updated_instance = super().update(instance, validated_data)

        # Audit log if role or platform_allowed changed
        request = self.context.get('request')
        actor = getattr(request, 'user', None) if request else None
        if old_role != new_role or old_platform != new_platform:
            changes = []
            if old_role != new_role:
                changes.append(f"Role changed from {old_role} to {new_role}")
            if old_platform != new_platform:
                changes.append(f"Platform allowed changed from {old_platform} to {new_platform}")

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
    Serializer for admin creating a new staff member with explicit username and password.
    Creates both the Django User and the linked StaffMember in a single transaction.
    """
    username = serializers.CharField(write_only=True, required=True, min_length=3)
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, required=True, min_length=8)
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

    def validate_username(self, value):
        cleaned_username = value.strip()
        if User.objects.filter(username__iexact=cleaned_username).exists():
            raise serializers.ValidationError(f'Username "{cleaned_username}" is already taken. Please choose another username.')
        return cleaned_username

    def validate(self, attrs):
        password = attrs.get('password')
        password_confirm = attrs.get('password_confirm')

        if password and len(password) < 8:
            raise serializers.ValidationError({'password': 'Password must be at least 8 characters long.'})

        if password != password_confirm:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})

        role = attrs.get('role')
        if role in ('super_admin', 'admin'):
            request = self.context.get('request')
            actor = getattr(request, 'user', None) if request else None
            is_actor_super_admin = actor and ((get_user_role(actor) == 'super_admin') or getattr(actor, 'is_superuser', False))
            if not is_actor_super_admin:
                raise PermissionDenied('Only Super Administrators can create Admin or Super Admin accounts.')

        return attrs

    def create(self, validated_data):
        username = validated_data.pop('username')
        password = validated_data.pop('password')
        validated_data.pop('password_confirm')

        email = validated_data.get('email') or f'{username}@homecare.local'
        first_name = validated_data.get('first_name', '')
        last_name = validated_data.get('last_name', '')
        role = validated_data.get('role', 'nurse')

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

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                password=password,
                email=email,
                first_name=first_name,
                last_name=last_name,
                is_staff=is_staff_user,
            )
            staff_member = StaffMember.objects.create(user=user, **validated_data)

        return staff_member

    def to_representation(self, instance):
        rep = StaffListSerializer(instance, context=self.context).data
        rep['username'] = instance.user.username if instance.user else None
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
