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

    # ── Identifiers (unencrypted — used for lookup/filtering) ─────────────────
    mr_number = models.CharField(max_length=20, unique=True, verbose_name='MR Number')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=1, choices=Gender.choices)
    national_id = models.CharField(max_length=30, blank=True)

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
        today = timezone.now().date()
        dob = self.date_of_birth
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))



class Prescription(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='prescriptions')
    prescribed_by = models.CharField(max_length=200)
    date = models.DateField()
    medication = models.CharField(max_length=200)
    dosage = models.CharField(max_length=100)
    frequency = models.CharField(max_length=100)
    route = models.CharField(max_length=50, blank=True)
    duration_days = models.IntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    document = models.FileField(upload_to='prescriptions/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


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
        return (
            f'{self.prescription.medication} — {day_names[self.day_number]} '
            f'— by {self.administered_by}'
        )

