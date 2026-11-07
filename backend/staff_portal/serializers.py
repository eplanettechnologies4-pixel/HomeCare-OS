from decimal import Decimal
from rest_framework import serializers
from django.utils import timezone
from staff.models import StaffMember, LeaveRequest
from bookings.models import Booking
from patients.models import Patient, DoctorNote, PhysioNote, TherapyNote, ClinicalConsent
from .models import (
    StaffRequest, OvertimeClaim, Complaint, ResignationRequest,
    CompanyPolicy, PolicyAcknowledgement, FamilyConcern
)


class StaffRequestSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    staff_employee_id = serializers.CharField(source='staff.employee_id', read_only=True)
    patient_name = serializers.CharField(source='patient.full_name', read_only=True, default='')
    patient_code = serializers.CharField(source='patient.patient_code', read_only=True, default='')
    reviewer_name = serializers.CharField(source='reviewed_by.get_full_name', read_only=True, default='')

    class Meta:
        model = StaffRequest
        fields = [
            'id', 'staff', 'staff_name', 'staff_employee_id',
            'request_type', 'patient', 'patient_name', 'patient_code',
            'booking', 'urgency', 'notes', 'details', 'status',
            'reviewed_by', 'reviewer_name', 'reviewer_notes', 'reviewed_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'staff', 'status', 'reviewed_by', 'reviewer_notes', 'reviewed_at', 'created_at', 'updated_at']


class StaffRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffRequest
        fields = [
            'id', 'request_type', 'patient', 'booking', 'urgency', 'notes', 'details'
        ]


class OvertimeClaimSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    reviewer_name = serializers.CharField(source='reviewer.get_full_name', read_only=True, default='')

    class Meta:
        model = OvertimeClaim
        fields = [
            'id', 'staff', 'staff_name', 'booking', 'date',
            'hours', 'derived_max_hours', 'reason', 'status',
            'reviewer', 'reviewer_name', 'reviewer_note', 'reviewed_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'staff', 'derived_max_hours', 'status', 'reviewer', 'reviewer_note', 'reviewed_at', 'created_at', 'updated_at']


class ComplaintSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    resolved_by_name = serializers.CharField(source='resolved_by.get_full_name', read_only=True, default='')

    class Meta:
        model = Complaint
        fields = [
            'id', 'staff', 'staff_name', 'subject', 'category',
            'description', 'status', 'resolution_note', 'resolved_by',
            'resolved_by_name', 'resolved_at', 'created_at'
        ]
        read_only_fields = ['id', 'staff', 'status', 'resolution_note', 'resolved_by', 'resolved_at', 'created_at']


class ResignationRequestSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    reviewer_name = serializers.CharField(source='reviewer.get_full_name', read_only=True, default='')

    class Meta:
        model = ResignationRequest
        fields = [
            'id', 'staff', 'staff_name', 'reason', 'notice_period_days',
            'last_working_day', 'status', 'reviewer', 'reviewer_name',
            'reviewer_note', 'reviewed_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'staff', 'notice_period_days', 'last_working_day', 'status', 'reviewer', 'reviewer_note', 'reviewed_at', 'created_at', 'updated_at']


class PermissionRequestSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    reviewer_name = serializers.CharField(source='reviewed_by.get_full_name', read_only=True, default='')

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'staff', 'staff_name', 'start_date', 'end_date',
            'start_time', 'end_time', 'is_permission', 'reason',
            'status', 'reviewed_by', 'reviewer_name', 'created_at'
        ]
        read_only_fields = ['id', 'staff', 'status', 'reviewed_by', 'created_at']


class CompanyPolicySerializer(serializers.ModelSerializer):
    is_acknowledged = serializers.SerializerMethodField()
    acknowledged_at = serializers.SerializerMethodField()

    class Meta:
        model = CompanyPolicy
        fields = [
            'id', 'title', 'slug', 'category', 'summary',
            'content', 'version', 'effective_date', 'is_active',
            'is_acknowledged', 'acknowledged_at', 'created_at'
        ]

    def get_is_acknowledged(self, obj):
        staff = self.context.get('staff')
        if not staff:
            return False
        return obj.acknowledgements.filter(staff=staff).exists()

    def get_acknowledged_at(self, obj):
        staff = self.context.get('staff')
        if not staff:
            return None
        ack = obj.acknowledgements.filter(staff=staff).first()
        return ack.acknowledged_at if ack else None


class FamilyConcernSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_code = serializers.CharField(source='patient.patient_code', read_only=True, default='')
    raised_by_name = serializers.CharField(source='raised_by.get_full_name', read_only=True, default='')
    responded_by_name = serializers.CharField(source='responded_by.get_full_name', read_only=True, default='')

    class Meta:
        model = FamilyConcern
        fields = [
            'id', 'patient', 'patient_name', 'patient_code', 'chart_type',
            'chart_record_id', 'raised_by', 'raised_by_name', 'message',
            'status', 'response_note', 'responded_by', 'responded_by_name',
            'responded_at', 'created_at'
        ]
        read_only_fields = ['id', 'raised_by', 'responded_by', 'responded_at', 'created_at']


class FamilyConcernCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FamilyConcern
        fields = ['patient', 'chart_type', 'chart_record_id', 'message']


class FamilyConcernRespondSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['acknowledge', 'resolve'])
    note = serializers.CharField(required=False, allow_blank=True, default='')


class PublicStaffVerifySerializer(serializers.Serializer):
    name = serializers.CharField()
    role = serializers.CharField()
    photo_url = serializers.CharField(allow_null=True)
    is_active = serializers.BooleanField()
    employee_id = serializers.CharField()


class DoctorNoteSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.full_name', read_only=True, default='')
    signed_by_name = serializers.CharField(source='signed_by.full_name', read_only=True, default='')

    class Meta:
        model = DoctorNote
        fields = [
            'id', 'patient', 'doctor', 'doctor_name', 'booking',
            'notes', 'plan', 'addenda', 'is_signed', 'signed_at',
            'signed_by', 'signed_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_signed', 'signed_at', 'signed_by', 'created_at', 'updated_at']


class PhysioNoteSerializer(serializers.ModelSerializer):
    physio_name = serializers.CharField(source='physio.full_name', read_only=True, default='')
    signed_by_name = serializers.CharField(source='signed_by.full_name', read_only=True, default='')

    class Meta:
        model = PhysioNote
        fields = [
            'id', 'patient', 'physio', 'physio_name', 'booking',
            'session_notes', 'mobility_status', 'goals', 'exercises',
            'is_signed', 'signed_at', 'signed_by', 'signed_by_name',
            'addenda', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_signed', 'signed_at', 'signed_by', 'created_at', 'updated_at']


class TherapyNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True, default='')
    signed_by_name = serializers.CharField(source='signed_by.full_name', read_only=True, default='')
    discipline_display = serializers.CharField(source='get_discipline_display', read_only=True)

    class Meta:
        model = TherapyNote
        fields = [
            'id', 'patient', 'author', 'author_name', 'booking',
            'discipline', 'discipline_display', 'session_notes', 'plan',
            'goals', 'exercises', 'is_signed', 'signed_at', 'signed_by',
            'signed_by_name', 'addenda', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_signed', 'signed_at', 'signed_by', 'created_at', 'updated_at']


class ClinicalConsentSerializer(serializers.ModelSerializer):
    signed_by_name = serializers.CharField(source='signed_by.full_name', read_only=True, default='')

    class Meta:
        model = ClinicalConsent
        fields = [
            'id', 'patient', 'consent_type', 'title', 'description',
            'granted_by', 'relationship', 'is_granted', 'is_signed',
            'signed_at', 'signed_by', 'signed_by_name', 'addenda',
            'created_at'
        ]
        read_only_fields = ['id', 'is_signed', 'signed_at', 'signed_by', 'created_at']

