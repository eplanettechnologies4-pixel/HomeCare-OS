import datetime
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError


class ClinicalQuerySet(models.QuerySet):
    """
    QuerySet that prevents bulk physical deletion of clinical records.
    Intercepts QuerySet.delete() across ORM and Django Admin bulk actions.
    """
    def delete(self):
        raise ValidationError(
            "Physical deletion of clinical records is prohibited. Use mark-entered-in-error."
        )


class ClinicalManager(models.Manager.from_queryset(ClinicalQuerySet)):
    """
    Default manager enforcing ClinicalQuerySet protections.
    """
    pass


class EnteredInErrorMixin(models.Model):
    """
    Abstract mixin enforcing EMR clinical record integrity:
    1. Zero physical deletion: delete() raises ValidationError.
    2. Entered-in-error lifecycle:
       - is_entered_in_error: boolean flag
       - entered_in_error_by: FK to User who marked the error
       - entered_in_error_at: audit timestamp of error marking
       - entered_in_error_reason: mandatory audit reason
    3. Irreversibility: once marked in error, cannot be reverted.
    4. Immutability: once marked in error, direct field modification is prohibited.
    """
    is_entered_in_error = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Designates if this clinical entry was marked entered in error.'
    )
    entered_in_error_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(app_label)s_%(class)s_entered_in_error",
        help_text='User who marked this clinical record as entered in error.'
    )
    entered_in_error_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Timestamp when this record was marked entered in error.'
    )
    entered_in_error_reason = models.TextField(
        blank=True,
        default='',
        help_text='Audit reason why this record was entered in error.'
    )

    objects = ClinicalManager()

    class Meta:
        abstract = True

    def get_creation_timestamp(self):
        """Returns the creation or event timestamp for edit window validation."""
        return (
            getattr(self, 'created_at', None) or
            getattr(self, 'recorded_at', None) or
            getattr(self, 'uploaded_at', None) or
            getattr(self, 'performed_at', None) or
            getattr(self, 'administered_at', None)
        )

    def is_within_edit_window(self):
        """
        Validates whether the record was created within the provisional grace window.
        Default is settings.CLINICAL_RECORD_EDIT_WINDOW_MINUTES (15 minutes).
        """
        window_minutes = getattr(settings, 'CLINICAL_RECORD_EDIT_WINDOW_MINUTES', 15)
        created_time = self.get_creation_timestamp()
        if not created_time:
            return True
        elapsed = timezone.now() - created_time
        return elapsed <= datetime.timedelta(minutes=window_minutes)

    def clean(self):
        super().clean()
        if self.pk:
            orig = self.__class__.objects.filter(pk=self.pk).first()
            if orig and orig.is_entered_in_error:
                # Rule 1: Cannot unmark
                if not self.is_entered_in_error:
                    raise ValidationError({
                        'is_entered_in_error': 'A record marked as entered in error cannot be reverted.'
                    })
                # Rule 2: Cannot edit any field once marked entered in error
                for f in self._meta.fields:
                    if getattr(orig, f.attname) != getattr(self, f.attname):
                        raise ValidationError(
                            "Records marked as entered in error are immutable and cannot be edited."
                        )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def mark_as_entered_in_error(self, user, reason):
        """
        Marks this record as entered in error.
        Requires a non-empty audit reason.
        Irreversible.
        """
        if self.is_entered_in_error:
            raise ValidationError("This record has already been marked as entered in error.")
        clean_reason = (reason or '').strip()
        if not clean_reason:
            raise ValidationError("A reason is required to mark a record as entered in error.")
        self.is_entered_in_error = True
        self.entered_in_error_by = user
        self.entered_in_error_at = timezone.now()
        self.entered_in_error_reason = clean_reason
        self.save(update_fields=[
            'is_entered_in_error',
            'entered_in_error_by',
            'entered_in_error_at',
            'entered_in_error_reason'
        ])

    def delete(self, *args, **kwargs):
        """Prohibits physical deletion across all clinical records."""
        raise ValidationError("Physical deletion of clinical records is prohibited. Mark as entered in error instead.")
