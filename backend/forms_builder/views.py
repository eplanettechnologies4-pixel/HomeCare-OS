import csv
from io import StringIO, BytesIO
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend

from .models import FormTemplate, FormField, FormSubmission
from .serializers import FormTemplateSerializer, FormFieldSerializer, FormSubmissionSerializer
from homecareOS.event_broadcaster import broadcast_event


class FormTemplateViewSet(viewsets.ModelViewSet):
    """
    Form Builder & Template Management.
    GET /api/forms/ - Returns active forms filtered by user audience (or all for admins).
    GET /api/forms/<id>/ - Returns form details with fields.
    POST /api/forms/<id>/submit/ - Submit a response with server-side field validation.
    POST /api/forms/<id>/duplicate/ - Duplicate template with all its fields.
    """
    queryset = FormTemplate.objects.prefetch_related('fields', 'submissions').all()
    serializer_class = FormTemplateSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['audience', 'is_active']
    search_fields = ['title', 'description']

    def get_permissions(self):
        if self.action in ['submit']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        # Admin / staff roles have full access to manage all forms
        is_admin_or_manager = (
            user.is_staff or user.is_superuser or
            getattr(getattr(user, 'profile', None), 'role', None) in ['admin', 'branch_manager', 'care_manager']
        )

        if not is_admin_or_manager:
            # Only active forms
            qs = qs.filter(is_active=True)

            # Determine user audience
            is_staff = hasattr(user, 'staffmember')
            is_family = hasattr(user, 'patient_profile') or (
                getattr(getattr(user, 'profile', None), 'role', None) == 'patient_family'
            )

            if is_staff:
                qs = qs.filter(audience__in=['all', 'staff'])
            elif is_family:
                qs = qs.filter(audience__in=['all', 'family', 'patient'])
            else:
                qs = qs.filter(audience='all')

        return qs

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        template = self.get_object()
        raw_data = request.data.get('data', {})
        files = request.data.get('files', {})
        patient_id = request.data.get('patient_id') or request.data.get('patient')

        # Resolve linked patient if submitted by family or patient
        patient = None
        if patient_id:
            from patients.models import Patient
            patient = Patient.objects.filter(pk=patient_id).first()
        elif hasattr(request.user, 'patient_profile'):
            patient = request.user.patient_profile

        # Server-side validation against FormField rules
        errors = {}
        for field in template.fields.all():
            val = raw_data.get(field.key)

            # Check conditional rule if present: {"field": "key", "equals": "value"}
            if field.conditional_rule and isinstance(field.conditional_rule, dict):
                cond_field = field.conditional_rule.get('field')
                cond_equals = field.conditional_rule.get('equals')
                if cond_field:
                    parent_val = raw_data.get(cond_field)
                    if str(parent_val) != str(cond_equals):
                        # Condition not met, skip validation for this field
                        continue

            # Required check
            if field.required:
                if val is None or val == '' or (isinstance(val, list) and len(val) == 0):
                    errors[field.key] = f"'{field.label}' is required."
                    continue

            if val is not None and val != '':
                # Type validation
                if field.type == 'number':
                    try:
                        float(val)
                    except (ValueError, TypeError):
                        errors[field.key] = f"'{field.label}' must be a valid number."
                elif field.type == 'rating':
                    try:
                        r = int(val)
                        if r < 1 or r > 5:
                            errors[field.key] = f"'{field.label}' rating must be between 1 and 5."
                    except (ValueError, TypeError):
                        errors[field.key] = f"'{field.label}' rating must be an integer between 1 and 5."
                elif field.type in ['select', 'radio']:
                    if field.options and isinstance(field.options, list) and len(field.options) > 0:
                        opt_values = [
                            opt if isinstance(opt, str) else opt.get('value', opt.get('label', ''))
                            for opt in field.options
                        ]
                        if str(val) not in [str(o) for o in opt_values]:
                            errors[field.key] = f"'{field.label}' selected value is invalid."

        if errors:
            return Response({'errors': errors, 'detail': 'Validation failed.'}, status=status.HTTP_400_BAD_REQUEST)

        # Create submission record
        submission = FormSubmission.objects.create(
            template=template,
            template_version=template.version,
            submitted_by=request.user,
            patient=patient,
            data=raw_data,
            files=files,
            status='submitted',
        )

        sub_data = FormSubmissionSerializer(submission).data

        # Real-time event: broadcast form.submitted to role_admin
        broadcast_event(
            event_type='form.submitted',
            data={
                'id': submission.id,
                'template_id': template.id,
                'template_title': template.title,
                'template_version': submission.template_version,
                'submitted_by': request.user.get_full_name() or request.user.username,
                'patient_id': patient.id if patient else None,
                'patient_name': patient.full_name if patient else None,
                'submitted_at': str(submission.submitted_at),
                'status': submission.status,
            },
            groups=['role_admin']
        )

        return Response(sub_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        template = self.get_object()
        new_template = FormTemplate.objects.create(
            title=f"{template.title} (Copy)",
            description=template.description,
            audience=template.audience,
            is_active=False,
            version=1,
            created_by=request.user if request.user.is_authenticated else None,
        )
        for field in template.fields.all():
            FormField.objects.create(
                template=new_template,
                label=field.label,
                key=field.key,
                type=field.type,
                required=field.required,
                options=field.options,
                order=field.order,
                help_text=field.help_text,
                conditional_rule=field.conditional_rule,
            )
        return Response(FormTemplateSerializer(new_template).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def submissions(self, request, pk=None):
        template = self.get_object()
        qs = template.submissions.select_related('submitted_by', 'patient').all()
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(FormSubmissionSerializer(qs, many=True).data)

    @action(detail=True, methods=['get'])
    def export_csv(self, request, pk=None):
        template = self.get_object()
        submissions = template.submissions.select_related('submitted_by', 'patient').all()
        fields = list(template.fields.all())

        output = StringIO()
        writer = csv.writer(output)

        header = ['Submission ID', 'Submitted By', 'Patient', 'Status', 'Submitted At'] + [f.label for f in fields]
        writer.writerow(header)

        for sub in submissions:
            row = [
                sub.id,
                sub.submitted_by.username if sub.submitted_by else 'Anonymous',
                sub.patient.full_name if sub.patient else 'N/A',
                sub.status,
                str(sub.submitted_at),
            ]
            for f in fields:
                val = sub.data.get(f.key, '')
                row.append(str(val))
            writer.writerow(row)

        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{template.title}_submissions.csv"'
        return response


class FormSubmissionViewSet(viewsets.ModelViewSet):
    queryset = FormSubmission.objects.select_related('template', 'submitted_by', 'patient').all()
    serializer_class = FormSubmissionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['template', 'status', 'patient']
    search_fields = ['template__title', 'submitted_by__username', 'patient__full_name']
