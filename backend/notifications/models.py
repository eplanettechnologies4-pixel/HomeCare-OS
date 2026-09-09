import secrets
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Notification(models.Model):
    """
    In-app notification for mobile and web users.
    Created server-side when key events occur (booking assigned,
    leave approved/rejected, medication overdue, etc.).
    """
    recipient = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='notifications'
    )
    # Short key used by the mobile app to choose an icon (e.g. 'calendar', 'pill', 'alert')
    icon_key = models.CharField(max_length=50, default='bell')
    message = models.TextField()
    # Which screen the mobile app should open when the notification is tapped
    target_screen = models.CharField(max_length=100, blank=True)
    # Optional JSON payload, e.g. {"booking_id": 42}
    target_params = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'[{"✓" if self.is_read else "●"}] {self.recipient} — {self.message[:60]}'


class PasswordResetOTP(models.Model):
    """
    Lightweight OTP store for the forgot-password flow.
    Each record is single-use and expires after 10 minutes.
    """
    # The email address or phone number the user supplied at the request step
    identifier = models.CharField(max_length=255)
    otp_code = models.CharField(max_length=6)
    # Short-lived token returned after OTP verification, required by reset-password step
    reset_token = models.CharField(max_length=64, blank=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'OTP for {self.identifier} (used={self.is_used})'

    @classmethod
    def generate(cls, identifier: str) -> 'PasswordResetOTP':
        """Create a new OTP record, invalidating any previous ones for this identifier."""
        cls.objects.filter(identifier=identifier, is_used=False).update(is_used=True)
        return cls.objects.create(
            identifier=identifier,
            otp_code=f'{secrets.randbelow(1_000_000):06d}',
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at
