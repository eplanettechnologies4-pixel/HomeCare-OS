from django.db import models
from django.contrib.auth.models import User


class ServiceType(models.TextChoices):
    SHORT_SERVICE = 'short_service', 'Short Service'
    MEDICINE_DELIVERY = 'medicine_delivery', 'Medicine Delivery'
    LONG_TERM = 'long_term', 'Long-Term Care'
    LONG_TERM_ADMISSION = 'long_term_admission', 'Long-Term Admission'


class BookingStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    ASSIGNED = 'assigned', 'Assigned'
    EN_ROUTE = 'en_route', 'En Route'
    IN_PROGRESS = 'in_progress', 'In Progress'
    COMPLETED = 'completed', 'Completed'
    CANCELLED = 'cancelled', 'Cancelled'
    LATE = 'late', 'Late'
    NO_SHOW = 'no_show', 'No Show'


class PaymentStatus(models.TextChoices):
    ADVANCE = 'advance', 'Advance Paid'
    PENDING = 'pending', 'Payment Pending'
    PARTIAL = 'partial', 'Partial Payment'
    WAIVED = 'waived', 'Waived'


class Booking(models.Model):
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='bookings')
    assigned_staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='bookings'
    )
    service_type = models.CharField(max_length=30, choices=ServiceType.choices)
    status = models.CharField(max_length=20, choices=BookingStatus.choices, default=BookingStatus.PENDING)
    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)

    scheduled_time = models.DateTimeField()
    actual_start_time = models.DateTimeField(null=True, blank=True)
    actual_end_time = models.DateTimeField(null=True, blank=True)

    address = models.TextField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    notes = models.TextField(blank=True)
    prescription_attachment = models.FileField(upload_to='prescriptions/', null=True, blank=True)

    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['-scheduled_time']

    def __str__(self):
        return f"#{self.pk} — {self.patient} | {self.service_type} | {self.status}"

    @property
    def duration_minutes(self):
        if self.actual_start_time and self.actual_end_time:
            delta = self.actual_end_time - self.actual_start_time
            return int(delta.total_seconds() / 60)
        return None

    @property
    def balance_due(self):
        return self.amount - self.amount_paid
