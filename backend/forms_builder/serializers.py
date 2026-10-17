from rest_framework import serializers
from .models import FormTemplate, FormField, FormSubmission


class FormFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormField
        fields = [
            'id', 'template', 'label', 'key', 'type', 'required',
            'options', 'order', 'help_text', 'width', 'conditional_rule'
        ]
        read_only_fields = ['id']


class FormTemplateSerializer(serializers.ModelSerializer):
    fields = FormFieldSerializer(many=True, required=False)
    submission_count = serializers.ReadOnlyField()
    has_submissions = serializers.SerializerMethodField()

    class Meta:
        model = FormTemplate
        fields = [
            'id', 'title', 'description', 'audience', 'is_active',
            'version', 'paper_config', 'created_by', 'created_at', 'updated_at',
            'fields', 'submission_count', 'has_submissions'
        ]
        read_only_fields = ['id', 'version', 'created_at', 'updated_at', 'created_by']

    def get_has_submissions(self, obj):
        return obj.has_submissions()

    def create(self, validated_data):
        fields_data = validated_data.pop('fields', [])
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user

        template = FormTemplate.objects.create(**validated_data)
        for i, field_data in enumerate(fields_data):
            field_data.pop('template', None)
            field_order = field_data.get('order', i)
            FormField.objects.create(template=template, order=field_order, **field_data)
        return template

    def update(self, instance, validated_data):
        fields_data = validated_data.pop('fields', None)

        # Versioning check: If form already has submissions, bump version
        if instance.has_submissions():
            instance.version += 1

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if fields_data is not None:
            # Recreate fields for the new version
            instance.fields.all().delete()
            for i, field_data in enumerate(fields_data):
                field_data.pop('template', None)
                field_order = field_data.get('order', i)
                FormField.objects.create(template=instance, order=field_order, **field_data)

        return instance


class FormSubmissionSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(source='submitted_by.get_full_name', read_only=True)
    template_title = serializers.CharField(source='template.title', read_only=True)
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)

    class Meta:
        model = FormSubmission
        fields = [
            'id', 'template', 'template_title', 'template_version',
            'submitted_by', 'submitted_by_name', 'patient', 'patient_name',
            'data', 'files', 'status', 'submitted_at'
        ]
        read_only_fields = ['id', 'template_version', 'submitted_at', 'submitted_by']
