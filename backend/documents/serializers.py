import os
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from .access import validate_uploaded_document_file
from .models import Document

ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}


class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    course_title = serializers.CharField(source='course.title', read_only=True)
    archived_by_name = serializers.CharField(source='archived_by.get_full_name', read_only=True)
    file_size_display = serializers.ReadOnlyField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'title', 'file', 'file_type', 'file_size', 'file_size_display',
            'category', 'owner_type', 'staff', 'patient', 'course',
            'staff_name', 'patient_name', 'course_title',
            'uploaded_by', 'uploaded_by_name', 'uploaded_at', 'expiry_date',
            'is_archived', 'archived_by', 'archived_by_name', 'archived_at', 'archive_reason',
            'download_url',
        ]
        read_only_fields = [
            'id', 'file_type', 'file_size', 'uploaded_at', 'uploaded_by',
            'is_archived', 'archived_by', 'archived_at', 'archive_reason',
        ]

    def get_download_url(self, obj):
        request = self.context.get('request')
        url = f"/api/documents/{obj.id}/download/"
        if request:
            return request.build_absolute_uri(url)
        return url

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'owner_type' in data:
            val = data['owner_type']
            if isinstance(val, list): val = val[0]
            if val == 'none' or not val:
                data['owner_type'] = 'general'
        if 'category' in data:
            cat = data['category']
            if isinstance(cat, list): cat = cat[0]
            cat_map = {
                'clinical': 'Clinical', 'hr': 'HR', 'legal': 'Legal',
                'safety': 'Safety', 'compliance': 'Compliance',
                'training': 'Training', 'other': 'Other'
            }
            data['category'] = cat_map.get(str(cat).lower(), str(cat).capitalize())
        return super().to_internal_value(data)

    def validate_file(self, value):
        if not value:
            raise serializers.ValidationError("Please select a file to upload.")
        try:
            validate_uploaded_document_file(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages if hasattr(exc, 'messages') else str(exc))
        return value

    def validate(self, attrs):
        owner_type = attrs.get('owner_type', getattr(self.instance, 'owner_type', 'general'))
        if owner_type == 'patient' and not attrs.get('patient', getattr(self.instance, 'patient', None)):
            raise serializers.ValidationError({'patient': 'Patient is required when owner_type is patient.'})
        if owner_type == 'staff' and not attrs.get('staff', getattr(self.instance, 'staff', None)):
            raise serializers.ValidationError({'staff': 'Staff member is required when owner_type is staff.'})
        if owner_type == 'course' and not attrs.get('course', getattr(self.instance, 'course', None)):
            raise serializers.ValidationError({'course': 'Course is required when owner_type is course.'})
        return attrs

    def create(self, validated_data):
        file_obj = validated_data.get('file')
        if file_obj:
            ext = os.path.splitext(file_obj.name)[1].lower().lstrip('.')
            validated_data['file_type'] = ext
            validated_data['file_size'] = file_obj.size

        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['uploaded_by'] = request.user

        return super().create(validated_data)
