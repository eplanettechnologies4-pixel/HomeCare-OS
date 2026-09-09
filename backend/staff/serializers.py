from rest_framework import serializers
from .models import StaffMember, LeaveRequest, AttendanceRecord, Certification, FeedbackRating


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

    class Meta:
        model = StaffMember
        fields = [
            'id', 'full_name', 'first_name', 'last_name', 'employee_id',
            'role', 'role_display', 'specialization',
            'status', 'status_display', 'phone', 'email',
            'photo', 'rating', 'hire_date', 'is_active',
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
