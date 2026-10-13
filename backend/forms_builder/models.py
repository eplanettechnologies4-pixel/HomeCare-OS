from django.db import models
from django.contrib.auth.models import User


class FormTemplate(models.Model):
    AUDIENCE_CHOICES = [
        ('family',  'Family'),
        ('staff',   'Staff'),
        ('patient', 'Patient'),
        ('all',     'All'),
    ]

    title       = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    audience    = models.CharField(max_length=20, choices=AUDIENCE_CHOICES, default='all')
    is_active   = models.BooleanField(default=True)
    version     = models.IntegerField(default=1)
    created_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_forms')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} (v{self.version}) [{self.audience}]"

    @property
    def submission_count(self):
        return self.submissions.count()

    def has_submissions(self):
        return self.submissions.exists()


class FormField(models.Model):
    TYPE_CHOICES = [
        ('text',      'Text'),
        ('textarea',  'Textarea'),
        ('number',    'Number'),
        ('date',      'Date'),
        ('select',    'Select'),
        ('radio',     'Radio'),
        ('checkbox',  'Checkbox'),
        ('file',      'File Upload'),
        ('signature', 'Signature'),
        ('rating',    'Rating'),
    ]

    template         = models.ForeignKey(FormTemplate, on_delete=models.CASCADE, related_name='fields')
    label            = models.CharField(max_length=255)
    key              = models.CharField(max_length=100)
    type             = models.CharField(max_length=20, choices=TYPE_CHOICES, default='text')
    required         = models.BooleanField(default=False)
    options          = models.JSONField(default=list, blank=True)
    order            = models.IntegerField(default=0)
    help_text        = models.CharField(max_length=255, blank=True)
    conditional_rule = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.template.title} — {self.label} ({self.key})"


class FormSubmission(models.Model):
    STATUS_CHOICES = [
        ('submitted', 'Submitted'),
        ('reviewed',  'Reviewed'),
    ]

    template         = models.ForeignKey(FormTemplate, on_delete=models.CASCADE, related_name='submissions')
    template_version = models.IntegerField(default=1)
    submitted_by     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='form_submissions')
    patient          = models.ForeignKey('patients.Patient', on_delete=models.SET_NULL, null=True, blank=True, related_name='form_submissions')
    data             = models.JSONField(default=dict)
    files            = models.JSONField(default=dict, blank=True)
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='submitted')
    submitted_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']

    def __str__(self):
        submitter = self.submitted_by.username if self.submitted_by else 'Anonymous'
        return f"Submission #{self.id} for {self.template.title} by {submitter}"
