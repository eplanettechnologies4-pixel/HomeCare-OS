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
    BRANCH_MANAGER = 'branch_manager', 'Branch Manager'
    ADMIN = 'admin', 'Admin'
    ACCOUNTANT = 'accountant', 'Accountant'
    CRM_EXECUTIVE = 'crm_executive', 'CRM Executive'
    LAB_TECH = 'lab_tech', 'Lab Technician'
    DELIVERY_RIDER = 'delivery_rider', 'Delivery Staff / Rider'


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
    id_card_front = models.ImageField(upload_to='staff_id_cards/', null=True, blank=True)
    id_card_back = models.ImageField(upload_to='staff_id_cards/', null=True, blank=True)
    employee_id = models.CharField(max_length=20, unique=True)
    hire_date = models.DateField()
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=5.0)
    designation = models.CharField(max_length=100, blank=True, default='')
    is_active = models.BooleanField(default=True)

    # Current location (updated via WebSocket)
    current_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    current_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    # Verification token for QR code lookup
    verification_token = models.CharField(max_length=64, blank=True, null=True)

    # Default transport & buddy fallback fields (used if not set on shift level)
    transport_driver_name = models.CharField(max_length=150, blank=True, default='', verbose_name='Default Transport Driver Name')
    transport_driver_phone = models.CharField(max_length=50, blank=True, default='', verbose_name='Default Transport Driver Phone')
    transport_pickup_time = models.CharField(max_length=50, blank=True, default='', verbose_name='Default Transport Pickup Time')
    buddy_staff = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='default_buddies_for', verbose_name='Default Buddy Staff')

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

    # Configurable working hours for staff profile (e.g. '09:00 - 17:00')
    working_hours = models.CharField(
        max_length=50,
        blank=True,
        default='09:00 - 17:00',
        verbose_name='Working Hours'
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
    is_permission = models.BooleanField(default=False)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
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


# ── Roster & Shift Scheduling Models ────────────────────────────────────────

class ShiftTemplate(models.Model):
    """
    Reusable shift template created and maintained by admin.
    Changing a template does not rewrite past published rosters;
    assignments snapshot shift_name, start_time, end_time, location, and color.
    """
    name = models.CharField(max_length=100)          # e.g. "Morning", "Evening", "Night", "Off"
    start_time = models.TimeField()
    end_time = models.TimeField()
    location = models.CharField(max_length=150, blank=True, default='Main Hospital / Clinic')
    color = models.CharField(max_length=30, default='#6D28D9')
    is_off = models.BooleanField(default=False)       # True for 'Off' duty marker
    is_active = models.BooleanField(default=True)     # Deactivated templates hidden from new assignments
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['start_time', 'name']

    def __str__(self):
        return f"{self.name} ({self.start_time.strftime('%H:%M')} - {self.end_time.strftime('%H:%M')})"


class RosterWeek(models.Model):
    """
    Weekly roster envelope starting on Monday (Asia/Karachi).
    Tracks draft vs. published state and revisions.
    """
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PUBLISHED = 'published', 'Published'

    week_start_date = models.DateField(unique=True)   # Must always be a Monday
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    revision = models.IntegerField(default=1)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='published_rosters'
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-week_start_date']

    def __str__(self):
        return f"Week starting {self.week_start_date} (Rev {self.revision} - {self.status})"


class RosterAssignment(models.Model):
    """
    Individual shift assignment for a staff member on a specific date.
    Snapshots template details so future template edits do not alter published history.
    Also supports per-shift transport driver and buddy staff fields.
    """
    roster_week = models.ForeignKey(RosterWeek, on_delete=models.CASCADE, related_name='assignments')
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='roster_assignments')
    date = models.DateField()
    shift_template = models.ForeignKey(
        ShiftTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='assignments'
    )

    # Snapshot fields (immutable snapshot of shift at time of assignment/publish)
    shift_name = models.CharField(max_length=100)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    location = models.CharField(max_length=150, blank=True, default='')
    color = models.CharField(max_length=30, default='#6D28D9')
    is_off = models.BooleanField(default=False)

    # Per-shift transport and buddy fields (reuse existing data models)
    buddy_staff = models.ForeignKey(
        StaffMember, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='buddy_roster_assignments', verbose_name='Shift Buddy Staff'
    )
    transport_driver_name = models.CharField(max_length=150, blank=True, default='', verbose_name='Shift Transport Driver')
    transport_driver_phone = models.CharField(max_length=50, blank=True, default='', verbose_name='Shift Transport Phone')
    transport_pickup_time = models.CharField(max_length=50, blank=True, default='', verbose_name='Shift Pickup Time')

    # Revision & publishing tracking
    revision = models.IntegerField(default=1)
    is_published = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date', 'staff']
        unique_together = ['staff', 'date', 'is_published']

    def __str__(self):
        return f"{self.staff.full_name} — {self.date}: {self.shift_name} (Rev {self.revision})"

