from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.core.files.storage import FileSystemStorage
from django.conf import settings
import os
import uuid


def get_private_staff_storage():
    private_root = getattr(settings, 'PRIVATE_MEDIA_ROOT', os.path.join(str(settings.BASE_DIR), 'private_media'))
    os.makedirs(private_root, exist_ok=True)
    return FileSystemStorage(location=private_root, base_url=None)


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

    # PROVISIONAL - HR terms need sign-off
    class EmploymentStatus(models.TextChoices):
        PROBATIONARY = 'probationary', 'Probationary'
        TRAINED = 'trained', 'Trained'
        PROFESSIONAL = 'professional', 'Professional'

    # PROVISIONAL - HR terms need sign-off
    class LifecycleStage(models.TextChoices):
        TRAINEE = 'trainee', 'Trainee'
        PROBATION = 'probation', 'Probation'
        ACTIVE = 'active', 'Active'

    # Lifecycle stage & progression tracking (null = Not reviewed / existing staff)
    lifecycle_stage = models.CharField(
        max_length=20,
        choices=LifecycleStage.choices,
        null=True,
        blank=True,
        db_index=True,
        verbose_name='Lifecycle Stage',
        help_text='PROVISIONAL - needs HR sign-off',
    )
    trainee_started_at = models.DateTimeField(null=True, blank=True)
    probation_started_at = models.DateTimeField(null=True, blank=True)
    active_since = models.DateTimeField(null=True, blank=True)

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

    # Employment status & probation tracking (PROVISIONAL - HR terms need sign-off)
    employment_status = models.CharField(
        max_length=30,
        choices=EmploymentStatus.choices,
        blank=True,
        default='',
        verbose_name='Employment Status',
        help_text='PROVISIONAL - HR terms need sign-off',
    )
    probation_end_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Probation End Date',
        help_text='PROVISIONAL - HR terms need sign-off',
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

    # Per-shift transport, buddy, supervisor, and patient fields (reuse existing data models)
    supervisor = models.ForeignKey(
        StaffMember, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='supervised_roster_assignments', verbose_name='Shift Supervisor'
    )
    buddy_staff = models.ForeignKey(
        StaffMember, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='buddy_roster_assignments', verbose_name='Shift Buddy Staff'
    )
    driver = models.ForeignKey(
        StaffMember, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='driver_roster_assignments', verbose_name='Shift Driver Staff'
    )
    driver_pickup_time = models.TimeField(null=True, blank=True, verbose_name='Driver Pickup Time')
    patients = models.ManyToManyField(
        'patients.Patient', blank=True, related_name='roster_assignments'
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


# ==============================================================================
# STAFF LIFECYCLE, ONBOARDING CHECKLISTS, ASSESSMENTS & VERIFICATION MODELS
# ==============================================================================

class StaffRequirementType(models.Model):
    class Kind(models.TextChoices):
        DOCUMENT = 'document', 'Document'
        ASSESSMENT = 'assessment', 'Assessment'
        FEEDBACK = 'feedback', 'Feedback'

    class Gate(models.TextChoices):
        TRAINEE_TO_PROBATION = 'trainee_to_probation', 'Trainee to Probation'
        PROBATION_TO_ACTIVE = 'probation_to_active', 'Probation to Active'

    code = models.CharField(max_length=50, unique=True, db_index=True)
    label = models.CharField(max_length=150, help_text='PROVISIONAL - needs HR sign-off')
    kind = models.CharField(max_length=20, choices=Kind.choices)
    gate = models.CharField(max_length=30, choices=Gate.choices)
    required_count = models.PositiveIntegerField(default=1, help_text='PROVISIONAL - needs HR sign-off')
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    requires_expiry = models.BooleanField(default=False)

    class Meta:
        ordering = ['gate', 'sort_order', 'id']

    def __str__(self):
        return f"{self.label} ({self.get_kind_display()})"


class StaffRequirement(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SUBMITTED = 'submitted', 'Submitted'
        VERIFIED = 'verified', 'Verified'
        REJECTED = 'rejected', 'Rejected'
        WAIVED = 'waived', 'Waived'

    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='requirements')
    requirement_type = models.ForeignKey(StaffRequirementType, on_delete=models.PROTECT, related_name='staff_requirements')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    verified_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_staff_requirements')
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    waived_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='waived_staff_requirements')
    waiver_reason = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['requirement_type__gate', 'requirement_type__sort_order', 'id']
        unique_together = [('staff', 'requirement_type')]

    def __str__(self):
        return f"{self.staff.full_name} - {self.requirement_type.label} ({self.status})"


def staff_document_upload_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    random_name = f"{uuid.uuid4().hex}{ext}"
    staff_id = instance.requirement.staff_id if instance.requirement_id else 'common'
    return os.path.join('staff_documents', f"staff_{staff_id}", random_name)


class StaffDocument(models.Model):
    requirement = models.ForeignKey(StaffRequirement, on_delete=models.CASCADE, related_name='documents')
    file = models.FileField(storage=get_private_staff_storage, upload_to=staff_document_upload_path)
    original_filename = models.CharField(max_length=255)
    stored_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField(help_text='File size in bytes')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    expiry_date = models.DateField(null=True, blank=True)
    is_current = models.BooleanField(default=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.original_filename} ({self.requirement.requirement_type.label})"


class StaffAssessment(models.Model):
    requirement = models.ForeignKey(StaffRequirement, on_delete=models.CASCADE, related_name='assessments')
    course_name = models.CharField(max_length=200, blank=True)
    completed_date = models.DateField(null=True, blank=True)
    exam_result = models.CharField(max_length=10, choices=[('pass', 'Pass'), ('fail', 'Fail')], blank=True)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    exam_date = models.DateField(null=True, blank=True)
    assessor = models.CharField(max_length=150, blank=True)
    competency_passed = models.BooleanField(null=True, blank=True)
    competency_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    lms_assignment = models.ForeignKey(
        'lms.CourseAssignment', null=True, blank=True, on_delete=models.SET_NULL, related_name='staff_assessments'
    )
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Assessment for {self.requirement.staff.full_name} ({self.requirement.requirement_type.label})"


class StaffFeedback(models.Model):
    class Source(models.TextChoices):
        MANAGEMENT = 'management', 'Management'
        PATIENT_FAMILY = 'patient_family', 'Patient Family'

    requirement = models.ForeignKey(StaffRequirement, on_delete=models.CASCADE, related_name='feedbacks')
    source = models.CharField(max_length=20, choices=Source.choices)
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text='Rating from 1 to 5'
    )
    comment = models.TextField()
    entered_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    patient = models.ForeignKey(
        'patients.Patient', null=True, blank=True, on_delete=models.SET_NULL, related_name='staff_feedbacks'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Feedback ({self.source}) for {self.requirement.staff.full_name}: {self.rating}/5"


class StaffStageEvent(models.Model):
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='stage_events')
    from_stage = models.CharField(max_length=20, null=True, blank=True)
    to_stage = models.CharField(max_length=20)
    decided_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    decided_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True)

    class Meta:
        ordering = ['-decided_at']

    def __str__(self):
        return f"{self.staff.full_name}: {self.from_stage or 'None'} -> {self.to_stage}"

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError("StaffStageEvent is append-only and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("StaffStageEvent records cannot be deleted.")


class StaffActivationCode(models.Model):
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='activation_codes')
    code_hash = models.CharField(max_length=128)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def is_valid(self):
        now = timezone.now()
        if self.used_at is not None:
            return False
        if self.expires_at < now:
            return False
        if self.locked_until and self.locked_until > now:
            return False
        return True


