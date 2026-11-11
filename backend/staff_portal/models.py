from decimal import Decimal
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class StaffRequest(models.Model):
    """
    Staff Request raised by clinical staff (e.g. nurse/assistant) during shifts.
    Types: supervisor_visit, pharmacy_order, equipment_order, appointment, procedure_change.
    These create a REQUEST for review by supervisor, care manager or pharmacy.
    They never create a final order or directly mutate a care plan.
    """
    class RequestType(models.TextChoices):
        SUPERVISOR_VISIT = 'supervisor_visit', 'Supervisor Visit'
        PHARMACY_ORDER = 'pharmacy_order', 'Pharmacy Order'
        EQUIPMENT_ORDER = 'equipment_order', 'Equipment Order'
        APPOINTMENT = 'appointment', 'Doctor Consultation / Appointment'
        PROCEDURE_CHANGE = 'procedure_change', 'Procedure Change'
        REFERRAL = 'referral', 'Clinical Referral'
        SHIFT_CHANGE = 'shift_change', 'Shift Change Request'

    class Urgency(models.TextChoices):
        ROUTINE = 'routine', 'Routine'
        URGENT = 'urgent', 'Urgent'
        EMERGENCY = 'emergency', 'Emergency'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Review'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged'
        IN_PROGRESS = 'in_progress', 'In Progress'
        DONE = 'done', 'Done'
        REJECTED = 'rejected', 'Rejected'

    staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.CASCADE, related_name='staff_requests'
    )
    request_type = models.CharField(max_length=40, choices=RequestType.choices)
    patient = models.ForeignKey(
        'patients.Patient', on_delete=models.CASCADE, null=True, blank=True, related_name='staff_requests'
    )
    booking = models.ForeignKey(
        'bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='staff_requests'
    )
    urgency = models.CharField(max_length=20, choices=Urgency.choices, default=Urgency.ROUTINE)
    notes = models.TextField()
    details = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    
    # Review workflow
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_staff_requests'
    )
    reviewer_notes = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_request_type_display()} (#{self.pk}) by {self.staff.full_name} - {self.status}"


class OvertimeClaim(models.Model):
    """
    Overtime claim submitted by staff member.
    The server derives claimable overtime from attendance (time beyond the rostered shift).
    A claim cannot exceed the derived maximum; one claim per shift.
    """
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        PAID = 'paid', 'Paid'

    staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.CASCADE, related_name='overtime_claims'
    )
    booking = models.ForeignKey(
        'bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='overtime_claims'
    )
    date = models.DateField()
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    derived_max_hours = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    reviewer = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_overtime_claims'
    )
    reviewer_note = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']
        unique_together = [['staff', 'date']]

    def __str__(self):
        return f"Overtime Claim {self.hours}h on {self.date} by {self.staff.full_name} ({self.status})"


class Complaint(models.Model):
    """
    Staff internal grievance / complaint submission.
    """
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        INVESTIGATING = 'investigating', 'Under Investigation'
        RESOLVED = 'resolved', 'Resolved'

    staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.CASCADE, related_name='complaints'
    )
    subject = models.CharField(max_length=200)
    category = models.CharField(max_length=50, default='workplace')
    description = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    resolution_note = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='resolved_complaints'
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Complaint #{self.pk}: {self.subject} ({self.status})"


class ResignationRequest(models.Model):
    """
    Staff resignation submission.
    One active request allowed per staff member; withdrawal allowed while pending.
    """
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        WITHDRAWN = 'withdrawn', 'Withdrawn'
        ACCEPTED = 'accepted', 'Accepted'
        REJECTED = 'rejected', 'Rejected'

    staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.CASCADE, related_name='resignation_requests'
    )
    reason = models.TextField()
    notice_period_days = models.IntegerField(default=30)
    last_working_day = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    reviewer = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_resignations'
    )
    reviewer_note = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Resignation for {self.staff.full_name} ({self.status})"


class CompanyPolicy(models.Model):
    """
    Internal company policies requiring staff acknowledgement.
    """
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=150, unique=True)
    category = models.CharField(max_length=100, default='General')
    summary = models.TextField(blank=True)
    content = models.TextField()
    version = models.CharField(max_length=20, default='1.0')
    effective_date = models.DateField(default=timezone.now)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return f"{self.title} (v{self.version})"


class PolicyAcknowledgement(models.Model):
    """
    Staff acknowledgement stamp for a policy.
    """
    policy = models.ForeignKey(
        CompanyPolicy, on_delete=models.CASCADE, related_name='acknowledgements'
    )
    staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.CASCADE, related_name='policy_acknowledgements'
    )
    acknowledged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['policy', 'staff']]
        ordering = ['-acknowledged_at']

    def __str__(self):
        return f"{self.staff.full_name} acknowledged {self.policy.title} at {self.acknowledged_at}"


class FamilyConcern(models.Model):
    """
    Family concern raised regarding a patient's chart module:
    vitals, medication, nursing_notes, doctor_notes, physio, intake_output.
    """
    CHART_CHOICES = [
        ('vitals', 'Vitals'),
        ('medication', 'Medication Chart'),
        ('nursing_notes', 'Nursing Notes'),
        ('doctor_notes', "Doctor's Notes"),
        ('physio', 'Physiotherapy'),
        ('intake_output', 'Intake & Output'),
    ]

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged'
        RESOLVED = 'resolved', 'Resolved'

    patient = models.ForeignKey(
        'patients.Patient', on_delete=models.CASCADE, related_name='family_concerns'
    )
    chart_type = models.CharField(max_length=50, choices=CHART_CHOICES)
    chart_record_id = models.IntegerField(null=True, blank=True)
    raised_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='raised_family_concerns'
    )
    message = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)

    response_note = models.TextField(blank=True)
    responded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='responded_family_concerns'
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Concern on {self.chart_type} for {self.patient.full_name} ({self.status})"
