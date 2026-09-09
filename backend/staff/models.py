from django.db import models
from django.contrib.auth.models import User


class StaffRole(models.TextChoices):
    NURSE = 'nurse', 'Nurse'
    DOCTOR = 'doctor', 'Doctor'
    PHYSIO = 'physio', 'Physiotherapist'
    SPEECH = 'speech', 'Speech & Language Therapist'
    PSYCHOLOGIST = 'psychologist', 'Psychologist'
    DIETICIAN = 'dietician', 'Dietician'
    CARE_MANAGER = 'care_manager', 'Client Care Manager'


class StaffStatus(models.TextChoices):
    AVAILABLE = 'available', 'Available'
    ON_VISIT = 'on_visit', 'On Visit'
    OFF_DUTY = 'off_duty', 'Off Duty'
    ON_LEAVE = 'on_leave', 'On Leave'


class StaffMember(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True, blank=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    role = models.CharField(max_length=20, choices=StaffRole.choices)
    specialization = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=StaffStatus.choices, default=StaffStatus.AVAILABLE)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    photo = models.ImageField(upload_to='staff_photos/', null=True, blank=True)
    employee_id = models.CharField(max_length=20, unique=True)
    hire_date = models.DateField()
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=5.0)
    is_active = models.BooleanField(default=True)

    # Current location (updated via WebSocket)
    current_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    current_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    # Verification token for QR code lookup
    verification_token = models.CharField(max_length=64, blank=True, null=True)

    class PlatformAllowed(models.TextChoices):
        WEB = 'web', 'Web Only'
        MOBILE = 'mobile', 'Mobile Only'
        BOTH = 'both', 'Web & Mobile'

    # Controls which platform(s) this staff member may log into.
    # Web-only roles (admin, accountant, crm_executive) → 'web'
    # Field clinical staff (nurse, doctor, physio, etc.) → 'mobile' or 'both'
    platform_allowed = models.CharField(
        max_length=10,
        choices=PlatformAllowed.choices,
        default=PlatformAllowed.MOBILE,
        help_text='Determines which platform login is permitted. '
                  'Mobile login is rejected for web-only roles.'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


class LeaveRequest(models.Model):
    class LeaveType(models.TextChoices):
        ANNUAL = 'annual', 'Annual Leave'
        SICK = 'sick', 'Sick Leave'
        UNPAID = 'unpaid', 'Unpaid Leave'
        EMERGENCY = 'emergency', 'Emergency Leave'

    class LeaveStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='leave_requests')
    leave_type = models.CharField(max_length=20, choices=LeaveType.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=LeaveStatus.choices, default=LeaveStatus.PENDING)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class AttendanceRecord(models.Model):
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='attendance_records')
    date = models.DateField()
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    visits_completed = models.IntegerField(default=0)
    total_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-date']
        unique_together = ['staff', 'date']


class Certification(models.Model):
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='certifications')
    name = models.CharField(max_length=200)
    issuing_body = models.CharField(max_length=200)
    issued_date = models.DateField()
    expiry_date = models.DateField(null=True, blank=True)
    document = models.FileField(upload_to='certifications/', null=True, blank=True)


class FeedbackRating(models.Model):
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='feedback_ratings')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE)
    booking = models.ForeignKey('bookings.Booking', on_delete=models.CASCADE)
    rating = models.IntegerField(choices=[(i, i) for i in range(1, 6)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
