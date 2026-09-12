from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from .models import StaffMember, StaffRole, LeaveRequest, AttendanceRecord, Certification, FeedbackRating


class StaffSummarySerializer(serializers.ModelSerializer):
    """Minimal representation for embedding in other serializers."""
    full_name = serializers.ReadOnlyField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = StaffMember
        fields = ['id', 'full_name', 'role', 'role_display', 'status', 'status_display', 'photo', 'rating']


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
            'role', 'role_display', 'specialization',
            'status', 'status_display', 'phone', 'email',
            'photo', 'rating', 'hire_date', 'is_active',
            'username', 'last_login', 'platform_allowed', 'platform_allowed_display',
        ]


class StaffDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
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
            'platform_allowed'
        ]

    def validate_username(self, value):
        cleaned_username = value.strip()
        if User.objects.filter(username__iexact=cleaned_username).exists():
            raise serializers.ValidationError(f'Username "{cleaned_username}" is already taken. Please choose another username.')
        return cleaned_username

    def validate(self, data):
        password = data.get('password')
        password_confirm = data.get('password_confirm')

        if len(password) < 8:
            raise serializers.ValidationError({'password': 'Password must be at least 8 characters long.'})

        if password != password_confirm:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})

        return data

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
