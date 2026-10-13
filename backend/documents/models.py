from django.db import models
from django.contrib.auth.models import User
import os


class Document(models.Model):
    CATEGORY_CHOICES = [
        ('Clinical', 'Clinical'),
        ('Legal', 'Legal'),
        ('HR', 'HR'),
        ('Safety', 'Safety'),
        ('Compliance', 'Compliance'),
        ('Training', 'Training'),
        ('Other', 'Other'),
    ]

    OWNER_TYPE_CHOICES = [
        ('staff', 'Staff'),
        ('patient', 'Patient'),
        ('course', 'Course'),
        ('general', 'General'),
    ]

    title       = models.CharField(max_length=255)
    file        = models.FileField(upload_to='documents/%Y/%m/')
    file_type   = models.CharField(max_length=20, blank=True)
    file_size   = models.BigIntegerField(default=0)  # in bytes
    category    = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='HR')
    owner_type  = models.CharField(max_length=20, choices=OWNER_TYPE_CHOICES, default='general')

    # Linked owners
    staff       = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='linked_documents')
    patient     = models.ForeignKey('patients.Patient', on_delete=models.SET_NULL, null=True, blank=True, related_name='linked_documents')
    course      = models.ForeignKey('lms.Course', on_delete=models.SET_NULL, null=True, blank=True, related_name='linked_documents')

    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='uploaded_documents')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    expiry_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.title} ({self.category})"

    @property
    def file_size_display(self):
        size = self.file_size
        if not size and self.file:
            try:
                size = self.file.size
            except Exception:
                size = 0
        if size >= 1024 * 1024 * 1024:
            return f"{size / (1024 * 1024 * 1024):.1f} GB"
        if size >= 1024 * 1024:
            return f"{size / (1024 * 1024):.1f} MB"
        if size >= 1024:
            return f"{size / 1024:.0f} KB"
        return f"{size} B"

    def save(self, *args, **kwargs):
        if self.file and (not self.file_size or not self.file_type):
            try:
                self.file_size = self.file.size
            except Exception:
                pass
            name = self.file.name or ''
            ext = os.path.splitext(name)[1].lower().lstrip('.')
            if ext:
                self.file_type = ext
        super().save(*args, **kwargs)
