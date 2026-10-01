"""
quality/models.py
─────────────────
Two new models that back the paper quality-assurance forms:

  VisitFeedback         — filled at end-of-visit; patient/family rates 7 criteria
  ManagerVisitChecklist — filled by a Care Manager during a spot-check visit
"""
from django.db import models


# ── Rating choices (shared) ───────────────────────────────────────────────────
class RatingChoice(models.TextChoices):
    EXCELLENT = 'excellent', 'Excellent'
    GOOD = 'good', 'Good'
    FAIR = 'fair', 'Fair'
    POOR = 'poor', 'Poor'


# ── Form 1: Visit Quality Feedback ────────────────────────────────────────────

class VisitFeedback(models.Model):
    """
    Filled at the end of a visit — nurse completes timestamps / vitals reference,
    then hands device to patient/family for ratings + signature.

    Vitals are NOT duplicated here.  We link to the VitalSign record that was
    already created during the visit (via VitalsEntryScreen) so data stays
    in a single authoritative place.
    """
    booking = models.ForeignKey(
        'bookings.Booking',
        on_delete=models.CASCADE,
        related_name='visit_feedbacks',
    )
    patient = models.ForeignKey(
        'patients.Patient',
        on_delete=models.CASCADE,
        related_name='visit_feedbacks',
    )
    staff = models.ForeignKey(
        'staff.StaffMember',
        on_delete=models.SET_NULL,
        null=True,
        related_name='visit_feedbacks',
        help_text='Attending staff member being evaluated.',
    )

    # ── Visit timestamps ──────────────────────────────────────────────────────
    call_time = models.DateTimeField(null=True, blank=True, help_text='Time the call / booking was made')
    attending_time = models.DateTimeField(null=True, blank=True, help_text='Time staff arrived at patient location')
    leaving_time = models.DateTimeField(null=True, blank=True, help_text='Time staff departed')

    # ── Vitals reference (link, not duplicate) ────────────────────────────────
    vital_sign = models.ForeignKey(
        'patients.VitalSign',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='feedback_forms',
        help_text='VitalSign record from this visit — avoids re-entry of vitals.',
    )

    # ── Clinical / prescription info ─────────────────────────────────────────
    prescription_by = models.CharField(max_length=200, blank=True)
    sign_of_reaction = models.TextField(blank=True, help_text='Any adverse reaction noted during visit')

    # ── 7-criteria rating table ───────────────────────────────────────────────
    rating_professionalism = models.CharField(
        max_length=10, choices=RatingChoice.choices, blank=True, verbose_name='Professionalism'
    )
    rating_punctuality = models.CharField(
        max_length=10, choices=RatingChoice.choices, blank=True, verbose_name='Punctuality'
    )
    rating_communication = models.CharField(
        max_length=10, choices=RatingChoice.choices, blank=True, verbose_name='Communication and Behaviour'
    )
    rating_hygiene = models.CharField(
        max_length=10, choices=RatingChoice.choices, blank=True, verbose_name='Hygiene Maintenance'
    )
    rating_privacy = models.CharField(
        max_length=10, choices=RatingChoice.choices, blank=True, verbose_name='Respect for Privacy'
    )
    rating_clinical_skills = models.CharField(
        max_length=10, choices=RatingChoice.choices, blank=True, verbose_name='Clinical Skills'
    )
    rating_overall = models.CharField(
        max_length=10, choices=RatingChoice.choices, blank=True, verbose_name='Overall Satisfaction'
    )

    # ── Free-text feedback ────────────────────────────────────────────────────
    suggestions = models.TextField(blank=True)

    # ── Signatures (stored as files, same pattern as ReportPhoto) ─────────────
    patient_signature = models.FileField(
        upload_to='quality/signatures/patient/%Y/%m/',
        null=True, blank=True,
    )
    patient_contact_number = models.CharField(max_length=30, blank=True)
    staff_signature = models.FileField(
        upload_to='quality/signatures/staff/%Y/%m/',
        null=True, blank=True,
    )
    manager_quality_signature = models.FileField(
        upload_to='quality/signatures/manager/%Y/%m/',
        null=True, blank=True,
        help_text='Added later by a Quality Manager reviewing the form.',
    )
    manager_signed_by = models.ForeignKey(
        'staff.StaffMember',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='quality_signed_feedbacks',
    )
    manager_signed_at = models.DateTimeField(null=True, blank=True)

    submitted_by = models.ForeignKey(
        'staff.StaffMember',
        on_delete=models.SET_NULL,
        null=True,
        related_name='submitted_feedbacks',
        help_text='Staff member who initiated the form (taken from JWT).',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Visit Quality Feedback'
        verbose_name_plural = 'Visit Quality Feedbacks'

    def __str__(self):
        return f'Feedback #{self.pk} — {self.patient} — {self.created_at:%Y-%m-%d}'

    @property
    def average_rating_score(self):
        """Return a numeric 1-4 average across all filled rating fields."""
        _map = {'excellent': 4, 'good': 3, 'fair': 2, 'poor': 1}
        fields = [
            self.rating_professionalism, self.rating_punctuality,
            self.rating_communication, self.rating_hygiene,
            self.rating_privacy, self.rating_clinical_skills,
            self.rating_overall,
        ]
        scores = [_map[f] for f in fields if f in _map]
        return round(sum(scores) / len(scores), 2) if scores else None


# ── Form 2: Manager Home Visit Checklist ─────────────────────────────────────

class ManagerVisitChecklist(models.Model):
    """
    Filled by a Care Manager during an in-person quality-check visit.
    Each section item is stored as a short remarks TextField; the UI presents
    them as free-text observations rather than boolean flags, consistent with
    the paper form.  This makes the data richer than a simple pass/fail grid.
    """
    patient = models.ForeignKey(
        'patients.Patient',
        on_delete=models.CASCADE,
        related_name='manager_checklists',
    )
    staff = models.ForeignKey(
        'staff.StaffMember',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='manager_checklists_as_evaluated',
        verbose_name='Visiting/Evaluated Staff',
    )
    manager = models.ForeignKey(
        'staff.StaffMember',
        on_delete=models.SET_NULL,
        null=True,
        related_name='manager_checklists_submitted',
        verbose_name='Manager (filled by)',
    )
    booking = models.ForeignKey(
        'bookings.Booking',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='manager_checklists',
    )

    staff_initial = models.CharField(max_length=20, blank=True, verbose_name="Staff Initial")

    # ── Patient Quality Care Section ─────────────────────────────────────────
    pc_hygienic_measures = models.TextField(blank=True, verbose_name='Hygienic Measures')
    pc_mobility = models.TextField(blank=True, verbose_name='Mobility')
    pc_diet = models.TextField(blank=True, verbose_name='Diet')
    pc_bedsores = models.TextField(blank=True, verbose_name='Bedsores')
    pc_grooming = models.TextField(blank=True, verbose_name='Grooming')
    pc_dressings = models.TextField(blank=True, verbose_name='Dressings (peg/trach/wound)')
    pc_catheter = models.TextField(blank=True, verbose_name='NG/Foley\'s Catheter')
    pc_peripheral_central_line = models.TextField(blank=True, verbose_name='Peripheral and Central Line')
    pc_bed_bath = models.TextField(blank=True, verbose_name='Bed Bath')

    # ── Staff Appearance Section ──────────────────────────────────────────────
    sa_dress_code = models.TextField(blank=True, verbose_name='Dress Code')
    sa_uniform = models.TextField(blank=True, verbose_name='Uniform')
    sa_shoes = models.TextField(blank=True, verbose_name='Shoes')
    sa_card = models.TextField(blank=True, verbose_name='Card (ID Badge)')
    sa_hygiene = models.TextField(blank=True, verbose_name='Hygiene')
    sa_grooming = models.TextField(blank=True, verbose_name='Grooming')

    # ── Staff Performance Section ─────────────────────────────────────────────
    sp_with_family = models.TextField(blank=True, verbose_name='Behaviour with Family')
    sp_with_patient = models.TextField(blank=True, verbose_name='Behaviour with Patient')
    sp_with_colleagues = models.TextField(blank=True, verbose_name='Behaviour with Senior and Junior')
    sp_punctuality = models.TextField(blank=True, verbose_name='Punctuality and Attendance')
    sp_infection_control = models.TextField(blank=True, verbose_name='Infection Control Practices')
    sp_care_plan_adherence = models.TextField(blank=True, verbose_name='Adherence to Care Plan')
    sp_burnout_signs = models.TextField(blank=True, verbose_name='Any Sign of Burnout')
    sp_emergency_protocols = models.TextField(blank=True, verbose_name='Emergency Protocols')

    # ── Documentation Section ─────────────────────────────────────────────────
    doc_care_plan_update = models.TextField(blank=True, verbose_name='Care Plan Update')
    doc_daily_records = models.TextField(blank=True, verbose_name='Daily Records Accuracy')
    doc_mar_event_records = models.TextField(blank=True, verbose_name='MAR / Event Records')

    # ── Manager's Comments Section ────────────────────────────────────────────
    comments = models.TextField(blank=True, verbose_name='Manager Comments')
    family_concerns = models.TextField(blank=True, verbose_name="Family's Concerns")
    staff_concerns = models.TextField(blank=True, verbose_name="Staff's Concerns")

    # ── Signatures ────────────────────────────────────────────────────────────
    manager_signature = models.FileField(
        upload_to='quality/checklist/manager/%Y/%m/', null=True, blank=True
    )
    guardian_signature = models.FileField(
        upload_to='quality/checklist/guardian/%Y/%m/', null=True, blank=True
    )
    staff_signature = models.FileField(
        upload_to='quality/checklist/staff/%Y/%m/', null=True, blank=True
    )

    visit_date = models.DateField(null=True, blank=True)
    visit_time = models.TimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Manager Home Visit Checklist'
        verbose_name_plural = 'Manager Home Visit Checklists'

    def __str__(self):
        return f'Checklist #{self.pk} — {self.patient} — {self.visit_date or self.created_at:%Y-%m-%d}'
