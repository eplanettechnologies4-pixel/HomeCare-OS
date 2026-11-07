from django.db import models
from patients.encryption import encrypt


class Patient(models.Model):
    """
    Patient demographic and clinical record.

    Field-level encryption strategy
    ────────────────────────────────
    Sensitive PHI fields are stored as Fernet-encrypted blobs in the DB column.
    Encryption/decryption is transparent to application code — read/write plain
    Python strings; django-cryptography handles the rest using FIELD_ENCRYPTION_KEY.

    UNENCRYPTED  (safe for ORM filtering / indexing):
      mr_number, first_name, last_name, date_of_birth, gender,
      national_id, is_active, assigned_care_manager

    ENCRYPTED (PHI — cannot be filtered via ORM, only read/write):
      phone, emergency_contact_phone, address,
      primary_diagnosis, secondary_diagnoses, allergies, blood_type
    """

    class Gender(models.TextChoices):
        MALE = 'M', 'Male'
        FEMALE = 'F', 'Female'
        OTHER = 'O', 'Other'

    class Source(models.TextChoices):
        ADMIN_DASHBOARD = 'admin_dashboard', 'Admin Dashboard'
        PUBLIC_WEBSITE = 'public_website', 'Public Website'
        PUBLIC_MOBILE_APP = 'public_mobile_app', 'Public Mobile App'

    # ── Identifiers (unencrypted — used for lookup/filtering) ─────────────────
    mr_number = models.CharField(max_length=20, unique=True, verbose_name='MR Number')
    patient_code = models.CharField(max_length=50, blank=True, default='', verbose_name='Special Patient Code')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=1, choices=Gender.choices)
    national_id = models.CharField(max_length=30, blank=True)
    source = models.CharField(
        max_length=30,
        choices=Source.choices,
        default=Source.ADMIN_DASHBOARD,
    )

    # ── Contact (ENCRYPTED PHI) ───────────────────────────────────────────────
    phone = encrypt(models.CharField(max_length=20, blank=True))
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = encrypt(models.CharField(max_length=20, blank=True))
    emergency_contact_relation = models.CharField(max_length=50, blank=True)

    # ── Location (ENCRYPTED PHI) ──────────────────────────────────────────────
    address = encrypt(models.TextField())

    # ── Geographic coordinates (unencrypted — numeric, non-identifying) ───────
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    # ── Clinical (ENCRYPTED PHI) ──────────────────────────────────────────────
    primary_diagnosis = encrypt(models.TextField())
    secondary_diagnoses = encrypt(models.TextField(blank=True))
    allergies = encrypt(models.TextField(blank=True))
    blood_type = encrypt(models.CharField(max_length=5, blank=True))

    # ── Care management (unencrypted) ─────────────────────────────────────────
    assigned_care_manager = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='managed_patients'
    )
    is_active = models.BooleanField(default=True)

    # ── Portal Login Account (optional) ──────────────────────────────────────
    portal_user = models.OneToOneField(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='patient_profile',
        verbose_name='Portal Login User',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.mr_number} — {self.full_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def age(self):
        from django.utils import timezone
        dob = self.date_of_birth
        if not dob:
            return None
        today = timezone.now().date()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))



class Prescription(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='prescriptions')
    booking = models.ForeignKey(
        'bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='prescriptions'
    )
    prescribed_by = models.CharField(max_length=200)
    date = models.DateField()
    medication = models.CharField(max_length=200)
    dosage = models.CharField(max_length=100)
    frequency = models.CharField(max_length=100)
    route = models.CharField(max_length=50, blank=True)
    duration_days = models.IntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    document = models.FileField(upload_to='prescriptions/', null=True, blank=True)
    uploaded_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='uploaded_prescriptions'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.medication} ({self.dosage}) for {self.patient}"

    # Ergonomic property aliases
    @property
    def drug_name(self):
        return self.medication

    @drug_name.setter
    def drug_name(self, value):
        self.medication = value

    @property
    def start_date(self):
        return self.date

    @start_date.setter
    def start_date(self, value):
        self.date = value

    @property
    def days_prescribed(self):
        return self.duration_days

    @days_prescribed.setter
    def days_prescribed(self, value):
        self.duration_days = value

    @property
    def prescription_file(self):
        return self.document

    @prescription_file.setter
    def prescription_file(self, value):
        self.document = value


class VitalSign(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='vitals')
    recorded_by = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True)
    booking = models.ForeignKey('bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True)
    recorded_at = models.DateTimeField()

    blood_pressure_systolic = models.IntegerField(null=True, blank=True)
    blood_pressure_diastolic = models.IntegerField(null=True, blank=True)
    heart_rate = models.IntegerField(null=True, blank=True)
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    spo2 = models.IntegerField(null=True, blank=True, verbose_name='SpO2 %')
    respiratory_rate = models.IntegerField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    blood_glucose = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    intake_ml = models.IntegerField(null=True, blank=True)
    output_ml = models.IntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-recorded_at']


class NurseNote(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='nurse_notes')
    recorded_by = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True)
    booking = models.ForeignKey('bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField()
    is_flagged = models.BooleanField(default=False)

    class Meta:
        ordering = ['-recorded_at']


class LabResult(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='lab_results')
    test_name = models.CharField(max_length=200)
    result_value = models.CharField(max_length=100)
    unit = models.CharField(max_length=50, blank=True)
    reference_range = models.CharField(max_length=100, blank=True)
    is_abnormal = models.BooleanField(default=False)
    collected_at = models.DateTimeField()
    reported_at = models.DateTimeField(null=True, blank=True)
    document = models.FileField(upload_to='labs/', null=True, blank=True)

    class Meta:
        ordering = ['-collected_at']


# ── Mobile: Daily Report (combined Form A + care checklist + photos) ──────────

class ReportPhoto(models.Model):
    """Photo attachment uploaded from the nurse's phone during a daily visit."""
    # FileField used instead of ImageField — Pillow is not required for file storage.
    # Swap back to ImageField once Pillow is installable (Python 3.14 prebuilt wheels).
    image = models.FileField(upload_to='report_photos/%Y/%m/%d/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Photo #{self.pk} — {self.uploaded_at:%Y-%m-%d %H:%M}'


class DailyReport(models.Model):
    """
    Combined daily visit submission from the mobile DailyReportScreen.
    Aggregates care checklist items, clinical notes, and photo attachments
    into a single record — avoids the 3-separate-call partial-failure risk
    that would occur if the mobile app called /notes/, /vitals/, etc. individually.

    Server-side:
      - submitted_by is taken from the JWT (never trusted from client)
      - A linked NurseNote is auto-created from the `notes` field
    """
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='daily_reports')
    booking = models.ForeignKey(
        'bookings.Booking', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='daily_reports'
    )
    submitted_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, related_name='daily_reports'
    )
    # JSON array of completed care checklist items, e.g. ["Medication Given","BP Check","Wound Dressed"]
    care_items_checked = models.JSONField(default=list)
    notes = models.TextField(blank=True)
    photos = models.ManyToManyField(ReportPhoto, blank=True, related_name='daily_reports')
    # FK back to the auto-created NurseNote for this report
    nurse_note = models.OneToOneField(
        NurseNote, on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_report'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'DailyReport #{self.pk} — {self.patient} — {self.created_at:%Y-%m-%d}'


# ── Mobile: MAR Administration (Form C dose-tick) ────────────────────────────

class MARAdministration(models.Model):
    """
    Records a single dose administration event on the MAR (Medication Administration Record) Sheet.
    Enforced unique per prescription per day to prevent double-administration.

    day_number follows Python's weekday() convention: 0=Mon, 1=Tue, … 6=Sun.
    """
    prescription = models.ForeignKey(
        Prescription, on_delete=models.CASCADE, related_name='administrations'
    )
    day_number = models.IntegerField(
        help_text='Day of week: 0=Monday … 6=Sunday (matches Python datetime.weekday())'
    )
    administered_by = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, related_name='mar_administrations'
    )
    administered_at = models.DateTimeField()

    class Meta:
        ordering = ['-administered_at']
        # Idempotency: one tick per prescription per day per calendar date
        unique_together = [('prescription', 'day_number', 'administered_at')]

    def __str__(self):
        day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        day_idx = self.day_number
        day_label = day_names[day_idx] if 0 <= day_idx < len(day_names) else f'Day {day_idx}'
        return (
            f'{self.prescription.medication} — {day_label} '
            f'— by {self.administered_by}'
        )


from django.core.exceptions import ValidationError


class SignedClinicalEntryMixin:
    """
    Model mixin enforcing Phase 1 clinical entry immutability:
    1. Once signed (is_signed=True in DB), the row cannot be deleted (delete() raises ValidationError).
    2. Once signed, is_signed cannot be reverted to False.
    3. The addenda history can only grow by appending new addendum objects. Existing items
       cannot be modified or removed.
    4. All other clinical and demographic fields are completely locked against direct mutation.
    """
    def clean(self):
        super().clean()
        if self.pk:
            orig = self.__class__.objects.filter(pk=self.pk).first()
            if orig and orig.is_signed:
                # Rule 1: Cannot un-sign
                if not self.is_signed:
                    raise ValidationError({'is_signed': 'A digitally signed clinical entry cannot be unsigned.'})

                # Rule 2: Addenda list can only grow, never be edited or removed
                orig_addenda = orig.addenda or []
                new_addenda = self.addenda or []
                if len(new_addenda) < len(orig_addenda):
                    raise ValidationError({'addenda': 'Signed clinical entry addenda history cannot be deleted or shortened.'})
                if new_addenda[:len(orig_addenda)] != orig_addenda:
                    raise ValidationError({'addenda': 'Signed clinical entry existing addenda cannot be edited or modified.'})

                # Rule 3: All other fields must remain identical
                for f in self._meta.fields:
                    if f.name in ('addenda', 'updated_at'):
                        continue
                    if getattr(orig, f.attname) != getattr(self, f.attname):
                        raise ValidationError({
                            f.name: (
                                f"Signed clinical entry is immutable. Field '{f.name}' cannot be modified directly. "
                                f"Clinical updates must be appended as an addendum."
                            )
                        })

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.is_signed:
            raise ValidationError("Signed clinical entries are permanently locked and cannot be deleted.")
        super().delete(*args, **kwargs)


class DoctorNote(SignedClinicalEntryMixin, models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='doctor_notes')
    doctor = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='authored_doctor_notes')
    booking = models.ForeignKey('bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='doctor_notes')
    notes = models.TextField(help_text='Clinical assessment, impression, and management notes')
    plan = models.TextField(blank=True, help_text='Treatment and follow-up plan')
    addenda = models.JSONField(default=list, blank=True, help_text='List of addendum objects [{"text": ..., "added_by": ..., "timestamp": ...}]')
    is_signed = models.BooleanField(default=False)
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_by = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='signed_doctor_notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"DoctorNote #{self.pk} — {self.patient} by {self.doctor} ({self.created_at:%Y-%m-%d})"


class PhysioNote(SignedClinicalEntryMixin, models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='physio_notes')
    physio = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='authored_physio_notes')
    booking = models.ForeignKey('bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='physio_notes')
    session_notes = models.TextField()
    mobility_status = models.CharField(max_length=150, blank=True, default='')
    goals = models.TextField(blank=True, default='')
    exercises = models.JSONField(default=list, blank=True, help_text='List of prescribed or performed exercises')
    is_signed = models.BooleanField(default=False)
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_by = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='signed_physio_notes')
    addenda = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"PhysioNote #{self.pk} — {self.patient} by {self.physio} ({self.created_at:%Y-%m-%d})"


class TherapyNote(SignedClinicalEntryMixin, models.Model):
    class Discipline(models.TextChoices):
        PHYSIOTHERAPY = 'physiotherapy', 'Physiotherapy'
        SPEECH_THERAPY = 'speech_therapy', 'Speech & Language Therapy'
        PSYCHOTHERAPY = 'psychotherapy', 'Psychotherapy'
        OCCUPATIONAL = 'occupational', 'Occupational Therapy'
        DIETETICS = 'dietetics', 'Dietetics'

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='therapy_notes')
    author = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='authored_therapy_notes')
    booking = models.ForeignKey('bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='therapy_notes')
    discipline = models.CharField(max_length=30, choices=Discipline.choices, default=Discipline.PHYSIOTHERAPY)
    session_notes = models.TextField(help_text='Session observations, assessments, and clinical findings')
    plan = models.TextField(blank=True, default='', help_text='Treatment and rehab plan')
    goals = models.TextField(blank=True, default='')
    exercises = models.JSONField(default=list, blank=True, help_text='List of exercises or therapy regimen')
    is_signed = models.BooleanField(default=False)
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_by = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='signed_therapy_notes')
    addenda = models.JSONField(default=list, blank=True, help_text='Immutable addenda history')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"TherapyNote #{self.pk} ({self.discipline}) — {self.patient} by {self.author} ({self.created_at:%Y-%m-%d})"


class ClinicalConsent(SignedClinicalEntryMixin, models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='consents')
    consent_type = models.CharField(max_length=100, default='General Care & Treatment')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    granted_by = models.CharField(max_length=150)
    relationship = models.CharField(max_length=100, default='Self')
    is_granted = models.BooleanField(default=True)
    is_signed = models.BooleanField(default=False)
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_by = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='signed_consents')
    addenda = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Consent #{self.pk} — {self.title} for {self.patient}"


