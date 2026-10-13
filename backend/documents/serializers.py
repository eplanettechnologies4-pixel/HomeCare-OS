import os
from rest_framework import serializers
from .models import Document

ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png', 'docx', 'mp4'}

MAX_SIZES_BYTES = {
    'pdf': 50 * 1024 * 1024,      # 50 MB
    'docx': 50 * 1024 * 1024,     # 50 MB
    'jpg': 25 * 1024 * 1024,      # 25 MB
    'jpeg': 25 * 1024 * 1024,     # 25 MB
    'png': 25 * 1024 * 1024,      # 25 MB
    'mp4': 2048 * 1024 * 1024,    # 2 GB
}


class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    course_title = serializers.CharField(source='course.title', read_only=True)
    file_size_display = serializers.ReadOnlyField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'title', 'file', 'file_type', 'file_size', 'file_size_display',
            'category', 'owner_type', 'staff', 'patient', 'course',
            'staff_name', 'patient_name', 'course_title',
            'uploaded_by', 'uploaded_by_name', 'uploaded_at', 'expiry_date',
            'download_url'
        ]
        read_only_fields = ['id', 'file_type', 'file_size', 'uploaded_at', 'uploaded_by']

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

        ext = os.path.splitext(value.name)[1].lower().lstrip('.')
        if ext not in ALLOWED_EXTENSIONS:
            allowed = ", ".join(sorted(list(ALLOWED_EXTENSIONS)))
            raise serializers.ValidationError(
                f"Unsupported file format '.{ext}'. Allowed types are: {allowed}."
            )

        max_size = MAX_SIZES_BYTES.get(ext, 50 * 1024 * 1024)
        if value.size > max_size:
            max_mb = max_size // (1024 * 1024)
            actual_mb = value.size / (1024 * 1024)
            raise serializers.ValidationError(
                f"File size exceeds the limit for {ext.upper()} files ({actual_mb:.1f} MB uploaded, maximum allowed is {max_mb} MB)."
            )

        return value

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
