from django.db import models
from django.contrib.auth.models import User


class ServiceType(models.TextChoices):
    SHORT_SERVICE = 'short_service', 'Short Service'
    MEDICINE_DELIVERY = 'medicine_delivery', 'Medicine Delivery'
    LONG_TERM = 'long_term', 'Long-Term Care'
    LONG_TERM_ADMISSION = 'long_term_admission', 'Long-Term Admission'
    PHYSIOTHERAPY = 'physiotherapy', 'Physiotherapy & Rehabilitation'
    SPEECH_THERAPY = 'speech_therapy', 'Speech & Language Therapy'
    PSYCHOTHERAPY = 'psychotherapy', 'Psychotherapy & Mental Health'
    DIETICIAN = 'dietician', 'Clinical Nutrition & Dietetics'
    OCCUPATIONAL = 'occupational', 'Occupational Therapy'


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


class ShiftDuration(models.TextChoices):
    ONE_HOUR = '1_hour', '1 Hour (Procedure)'
    TWO_HOURS = '2_hours', '2 Hours'
    FOUR_HOURS = '4_hours', '4 Hours (Half Day)'
    EIGHT_HOURS = '8_hours', '8 Hours (Full Day/Night)'
    TWELVE_HOURS = '12_hours', '12 Hours (Extended Shift)'
    TWENTY_FOUR_HOURS = '24_hours', '24 Hours (Full Bedside)'


class ShiftFrequency(models.TextChoices):
    ONCE = 'once', 'Once (Single Visit)'
    DAILY = 'daily', 'Daily'
    ALTERNATE_DAYS = 'alternate_days', 'Alternate Days'
    TWICE_WEEKLY = 'twice_weekly', 'Twice Weekly'
    WEEKLY = 'weekly', 'Weekly'
    MONTHLY = 'monthly', 'Monthly Admission'


class GenderPreference(models.TextChoices):
    ANY = 'any', 'No Preference'
    FEMALE = 'female', 'Female Staff Only'
    MALE = 'male', 'Male Staff Only'


class Booking(models.Model):
    # Reference
    reference_code = models.CharField(max_length=30, unique=True, null=True, blank=True, verbose_name='Booking Reference')

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='bookings')
    assigned_staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='bookings'
    )
    backup_staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='backup_bookings'
    )
    service_type = models.CharField(max_length=30, choices=ServiceType.choices)
    status = models.CharField(max_length=20, choices=BookingStatus.choices, default=BookingStatus.PENDING)
    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    payment_method = models.CharField(max_length=50, blank=True, default='cash_on_delivery')

    # Shift & Timing
    scheduled_time = models.DateTimeField()
    shift_duration = models.CharField(max_length=30, choices=ShiftDuration.choices, default=ShiftDuration.FOUR_HOURS)
    shift_frequency = models.CharField(max_length=30, choices=ShiftFrequency.choices, default=ShiftFrequency.ONCE)
    actual_start_time = models.DateTimeField(null=True, blank=True)
    actual_end_time = models.DateTimeField(null=True, blank=True)

    # Location & Demographics Cache
    address = models.TextField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    patient_dob = models.DateField(null=True, blank=True)
    patient_age = models.IntegerField(null=True, blank=True)
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)

    # Clinical Intake
    diagnosis = models.TextField(blank=True)
    allergies = models.TextField(blank=True, default='NKDA')
    has_prescription = models.BooleanField(default=False)
    consult_doctor_needed = models.BooleanField(default=False)
    prescription_attachment = models.FileField(upload_to='prescriptions/', null=True, blank=True)

    # Clinical Assignment & Coordination
    care_manager_name = models.CharField(max_length=150, blank=True, default='Hina Malik (Care Coordinator)')
    clinical_requirements = models.TextField(blank=True)
    assigned_on = models.DateTimeField(null=True, blank=True)

    # Optional Preferences & Notes
    gender_preference = models.CharField(max_length=20, choices=GenderPreference.choices, default=GenderPreference.ANY)
    consultant_name = models.CharField(max_length=150, blank=True)
    consultant_details = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    # Financials
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['-scheduled_time']

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if not self.reference_code:
            from django.utils import timezone
            year = timezone.now().year
            self.reference_code = f"BK-{year}-{str(self.pk).zfill(4)}"
            Booking.objects.filter(pk=self.pk).update(reference_code=self.reference_code)

    def __str__(self):
        ref = self.reference_code or f"#{self.pk}"
        return f"{ref} — {self.patient} | {self.service_type} | {self.status}"

    @property
    def duration_minutes(self):
        if self.actual_start_time and self.actual_end_time:
            delta = self.actual_end_time - self.actual_start_time
            return int(delta.total_seconds() / 60)
        return None

    @property
    def balance_due(self):
        return self.amount - self.amount_paid
