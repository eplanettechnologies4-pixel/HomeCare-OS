"""
quality/serializers.py
"""
import base64
import uuid
from django.core.files.base import ContentFile
from rest_framework import serializers
from .models import VisitFeedback, ManagerVisitChecklist


# ── Helpers ───────────────────────────────────────────────────────────────────

def _decode_signature(field_value, prefix):
    """
    Accept a base64 data-URI string (data:image/png;base64,…) OR a regular
    uploaded file.  Returns a ContentFile ready to be saved, or None if empty.
    """
    if not field_value or not isinstance(field_value, str):
        return None
    if field_value.startswith('data:'):
        _, encoded = field_value.split(',', 1)
        return ContentFile(base64.b64decode(encoded), name=f'{prefix}_{uuid.uuid4().hex[:8]}.png')
    return None


class Base64SignatureField(serializers.Field):
    """
    Custom field: accepts a base64 data-URI string on write (from the
    canvas SignaturePad on mobile/web) and returns a URL string on read.
    """
    def to_representation(self, value):
        if not value:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(value.url)
        return value.url

    def to_internal_value(self, data):
        if not data:
            return None
        if isinstance(data, str) and data.startswith('data:'):
            _, encoded = data.split(',', 1)
            return ContentFile(
                base64.b64decode(encoded),
                name=f'sig_{uuid.uuid4().hex[:8]}.png'
            )
        # Already a file object (multipart upload)
        return data


# ── Visit Feedback ────────────────────────────────────────────────────────────

class VisitFeedbackListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    average_rating_score = serializers.ReadOnlyField()
    patient_signature_url = serializers.SerializerMethodField()
    staff_signature_url = serializers.SerializerMethodField()
    manager_quality_signature_url = serializers.SerializerMethodField()

    class Meta:
        model = VisitFeedback
        fields = [
            'id', 'booking', 'patient', 'patient_name', 'staff', 'staff_name',
            'call_time', 'attending_time', 'leaving_time',
            'vital_sign',
            'prescription_by', 'sign_of_reaction',
            'rating_professionalism', 'rating_punctuality', 'rating_communication',
            'rating_hygiene', 'rating_privacy', 'rating_clinical_skills', 'rating_overall',
            'suggestions',
            'patient_signature_url', 'patient_contact_number',
            'staff_signature_url', 'manager_quality_signature_url',
            'manager_signed_by', 'manager_signed_at',
            'average_rating_score', 'created_at',
        ]

    def get_patient_signature_url(self, obj):
        if obj.patient_signature:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.patient_signature.url) if request else obj.patient_signature.url
        return None

    def get_staff_signature_url(self, obj):
        if obj.staff_signature:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.staff_signature.url) if request else obj.staff_signature.url
        return None

    def get_manager_quality_signature_url(self, obj):
        if obj.manager_quality_signature:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.manager_quality_signature.url) if request else obj.manager_quality_signature.url
        return None


class VisitFeedbackCreateSerializer(serializers.ModelSerializer):
    """
    Used for POST (create).  Signatures can be sent as base64 data-URIs
    (from SignaturePad canvas) or as multipart file uploads.
    submitted_by is always taken from the JWT — never from client data.
    """
    patient_signature = Base64SignatureField(required=False, allow_null=True)
    staff_signature = Base64SignatureField(required=False, allow_null=True)

    class Meta:
        model = VisitFeedback
        fields = [
            'booking', 'patient', 'staff',
            'call_time', 'attending_time', 'leaving_time',
            'vital_sign',
            'prescription_by', 'sign_of_reaction',
            'rating_professionalism', 'rating_punctuality', 'rating_communication',
            'rating_hygiene', 'rating_privacy', 'rating_clinical_skills', 'rating_overall',
            'suggestions',
            'patient_signature', 'patient_contact_number', 'staff_signature',
        ]


class ManagerSignSerializer(serializers.Serializer):
    """Used for the PATCH manager-sign action."""
    manager_quality_signature = Base64SignatureField(required=True)


# ── Manager Visit Checklist ───────────────────────────────────────────────────

class ManagerVisitChecklistSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    manager_name = serializers.CharField(source='manager.full_name', read_only=True)
    manager_signature = Base64SignatureField(required=False, allow_null=True)
    guardian_signature = Base64SignatureField(required=False, allow_null=True)
    staff_signature = Base64SignatureField(required=False, allow_null=True)
    manager_signature_url = serializers.SerializerMethodField()
    guardian_signature_url = serializers.SerializerMethodField()
    staff_signature_url = serializers.SerializerMethodField()

    class Meta:
        model = ManagerVisitChecklist
        fields = '__all__'
        read_only_fields = ['id', 'manager', 'created_at', 'updated_at']

    def get_manager_signature_url(self, obj):
        if obj.manager_signature:
            req = self.context.get('request')
            return req.build_absolute_uri(obj.manager_signature.url) if req else obj.manager_signature.url
        return None

    def get_guardian_signature_url(self, obj):
        if obj.guardian_signature:
            req = self.context.get('request')
            return req.build_absolute_uri(obj.guardian_signature.url) if req else obj.guardian_signature.url
        return None

    def get_staff_signature_url(self, obj):
        if obj.staff_signature:
            req = self.context.get('request')
            return req.build_absolute_uri(obj.staff_signature.url) if req else obj.staff_signature.url
        return None
