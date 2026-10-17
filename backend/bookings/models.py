from decimal import Decimal
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
    DOCTOR_CONSULTATION = 'doctor_consultation', 'Doctor Consultation'
    DOCTORS = 'doctors', 'Doctors'
    ELDERLY_CARE = 'elderly_care', 'Elderly Care'
    NURSING = 'nursing', 'Nursing'
    NURSING_CARE = 'nursing_care', 'Nursing Care'
    # New service catalogue choices
    LAB_TEST = 'lab_test', 'Lab Test'
    EQUIPMENT_RENTAL = 'equipment_rental', 'Equipment Rental'
    PSYCHOLOGY = 'psychology', 'Psychology'
    NUTRITION = 'nutrition', 'Nutrition'
    BABY_SITTER = 'baby_sitter', 'Baby Sitter'


class ServiceMode(models.TextChoices):
    ONLINE = 'online', 'Online'
    HOME = 'home', 'Home'


class ProviderLevel(models.TextChoices):
    SPECIALIST = 'specialist', 'Specialist'
    MEDICAL_OFFICER = 'medical_officer', 'Medical Officer'


class ShiftRole(models.TextChoices):
    RN = 'rn', 'Registered Nurse (RN)'
    ASSISTANT = 'assistant', 'Nursing Assistant'
    ATTENDANT = 'attendant', 'Nursing Attendant'


class RentalPeriod(models.TextChoices):
    DAILY = 'daily', 'Daily'
    WEEKLY = 'weekly', 'Weekly'
    MONTHLY = 'monthly', 'Monthly'


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
    recurring_days = models.JSONField(default=list, blank=True)
    recurrence_end_date = models.DateField(null=True, blank=True)
    parent_booking = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='recurring_instances')
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

    # Service Catalogue Extended Fields
    requested_item = models.CharField(max_length=255, blank=True, default='')
    service_mode = models.CharField(max_length=20, choices=ServiceMode.choices, blank=True, default='')
    provider_level = models.CharField(max_length=30, choices=ProviderLevel.choices, blank=True, default='')
    shift_role = models.CharField(max_length=30, choices=ShiftRole.choices, blank=True, default='')
    rental_period = models.CharField(max_length=20, choices=RentalPeriod.choices, blank=True, default='')
    estimated_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Financials
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))

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


class ServiceCatalogItem(models.Model):
    category = models.CharField(max_length=50, db_index=True)
    name = models.CharField(max_length=150)
    caption = models.CharField(max_length=255, blank=True, default='')
    price_min = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_max = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_text = models.CharField(max_length=100, blank=True, default='')
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'category', 'name']
        verbose_name = 'Service Catalog Item'
        verbose_name_plural = 'Service Catalog Items'

    # Alias mapping for client/mobile application service names
    ALIAS_MAP = {
        # Doctors
        "online consultation, specialist": ("doctors", "Online Specialist"),
        "online consultation, medical officer": ("doctors", "Online Medical Officer"),
        "home visit, specialist": ("doctors", "Home visit Specialist"),
        "home visit, medical officer": ("doctors", "Home visit Medical Officer"),
        "follow-up consultation": ("doctors", "Follow-up"),

        # Nursing Short Term
        "iv/im/sc/intradermal injections": ("short_service", "IV/IM/SC/intradermal injections"),
        "iv cannulation and iv therapy": ("short_service", "IV cannulation and IV therapy"),
        "stitch removal": ("short_service", "Stitch removal"),
        "wound dressing and care": ("short_service", "Wound dressing"),
        "ng tube insertion and care": ("short_service", "NG tube"),
        "urinary catheter insertion and care": ("short_service", "Urinary catheter"),
        "suctioning": ("short_service", "Suctioning"),
        "nebulization": ("short_service", "Nebulization"),
        "colostomy bag change and care": ("short_service", "Colostomy bag"),
        "tracheostomy care and tube change": ("short_service", "Tracheostomy care and tube change"),
        # New short-term aliases
        "staff retaining time after one hour": ("short_service", "Staff retaining time after one hour"),
        "staff retaining time": ("short_service", "Staff retaining time after one hour"),
        "pop removal": ("short_service", "POP removal"),
        "enema insertion": ("short_service", "Enema insertion"),
        "enema": ("short_service", "Enema insertion"),
        "suprapubic catheter insertion": ("short_service", "Suprapubic catheter insertion"),
        "suprapubic catheter": ("short_service", "Suprapubic catheter insertion"),
        "peg tube replacement": ("short_service", "PEG tube replacement"),
        "peg tube": ("short_service", "PEG tube replacement"),

        # Physiotherapy
        "home physiotherapy session": ("physiotherapy", "home session"),
        "home speech and language therapy / stroke rehabilitation": ("physiotherapy", "speech and language therapy / stroke rehab"),
        "online physiotherapy consultation": ("physiotherapy", "online physio"),

        # Ambiguous: Online session
        # psychology -> online 3000; nutrition -> online 2500; physiotherapy -> online physio 2000
        "online session": {
            "psychology": ("psychology", "online"),
            "psychotherapy": ("psychology", "online"),
            "nutrition": ("nutrition", "online"),
            "dietician": ("nutrition", "online"),
            "physiotherapy": ("physiotherapy", "online physio"),
        },

        # Ambiguous: In-person or home visit
        # psychology -> in-person or home 5000; nutrition -> home 5000; physiotherapy -> home session 3000
        "in-person or home visit": {
            "psychology": ("psychology", "in-person or home"),
            "psychotherapy": ("psychology", "in-person or home"),
            "nutrition": ("nutrition", "home"),
            "dietician": ("nutrition", "home"),
            "physiotherapy": ("physiotherapy", "home session"),
        },

        # Lab & Diagnostics
        "blood sample collection": ("lab_test", "blood sample"),
        "arterial blood sample collection": ("lab_test", "Arterial blood sample"),
        "arterial blood sample": ("lab_test", "Arterial blood sample"),
        # Urine sample: old name kept as alias, maps to the renamed item
        "urine sample collection": ("lab_test", "Urine sample collection (with catheter insertion)"),
        "urine sample": ("lab_test", "Urine sample collection (with catheter insertion)"),
        "urine sample collection (with catheter insertion)": ("lab_test", "Urine sample collection (with catheter insertion)"),
        "ecg at home": ("lab_test", "ECG at home"),
        "sleep study / holter": ("lab_test", "sleep study / Holter"),
        "sleep study": ("lab_test", "sleep study / Holter"),
        "holter monitor": ("lab_test", "sleep study / Holter"),

        # Equipment Rental
        "electric hospital bed (5- and 7-function)": ("equipment_rental", "electric hospital bed"),
        "electric bed": ("equipment_rental", "electric hospital bed"),
        "manual hospital bed": ("equipment_rental", "manual bed"),
        "manual bed": ("equipment_rental", "manual bed"),
        "air mattress": ("equipment_rental", "air mattress"),
        "oxygen cylinder": ("equipment_rental", "oxygen cylinder"),
        "oxygen concentrator": ("equipment_rental", "oxygen concentrator 5 litres"),
        "oxygen concentrator 5 litres": ("equipment_rental", "oxygen concentrator 5 litres"),
        "oxygen concentrator 5l": ("equipment_rental", "oxygen concentrator 5 litres"),
        "oxygen concentrator 10 litres": ("equipment_rental", "oxygen concentrator 10 litres"),
        "oxygen concentrator 10l": ("equipment_rental", "oxygen concentrator 10 litres"),
        "nebulizer": ("equipment_rental", "nebulizer"),
        "iv pole": ("equipment_rental", "IV pole and stand"),
        "iv pole and stand": ("equipment_rental", "IV pole and stand"),
        "cardiac monitor": ("equipment_rental", "cardiac monitor"),
        "bipap": ("equipment_rental", "BiPAP"),
        "suction machine": ("equipment_rental", "suction machine"),

        # Ambiguous: Home consultation
        # nutrition -> home 5000; doctors -> Home visit Specialist 5000; psychology -> in-person or home 5000
        "home consultation": {
            "nutrition": ("nutrition", "home"),
            "dietician": ("nutrition", "home"),
            "doctors": ("doctors", "Home visit Specialist"),
            "doctor_consultation": ("doctors", "Home visit Specialist"),
            "psychology": ("psychology", "in-person or home"),
            "psychotherapy": ("psychology", "in-person or home"),
        },

        # Baby Sitter Care
        "12 hour shift": ("baby_sitter", "12h"),
        "24 hour shift": ("baby_sitter", "24h"),
    }

    # Combinations that are NOT offered in long-term nursing
    _LONG_TERM_NOT_OFFERED = {
        ("8h", "attendant"),   # 8h Attendant: not available
        ("24h", "rn"),         # 24h Registered Nurse: no longer offered
    }

    # Long-term nursing canonical name mapping: (package_type, shift, role) -> catalog name
    _LONG_TERM_MAPPING = {
        ("per month", "8h", "rn"): "Per month - 8h - Registered Nurse (RN)",
        ("per month", "8h", "assistant"): "Per month - 8h - Nursing Assistant",
        ("per month", "12h", "rn"): "Per month - 12h - Registered Nurse (RN)",
        ("per month", "12h", "assistant"): "Per month - 12h - Nursing Assistant",
        ("per month", "12h", "attendant"): "Per month - 12h - Nursing Attendant",
        ("per month", "24h", "assistant"): "Per month - 24h - Nursing Assistant",
        ("per month", "24h", "attendant"): "Per month - 24h - Nursing Attendant",
        ("per shift", "8h", "rn"): "Per shift - 8h - Registered Nurse (RN)",
        ("per shift", "8h", "assistant"): "Per shift - 8h - Nursing Assistant",
        ("per shift", "12h", "rn"): "Per shift - 12h - Registered Nurse (RN)",
        ("per shift", "12h", "assistant"): "Per shift - 12h - Nursing Assistant",
        ("per shift", "12h", "attendant"): "Per shift - 12h - Nursing Attendant",
        ("per shift", "24h", "assistant"): "Per shift - 24h - Nursing Assistant",
        ("per shift", "24h", "attendant"): "Per shift - 24h - Nursing Attendant",
    }

    @classmethod
    def resolve_long_term_nursing(cls, name_str):
        """
        Parses long-term nursing strings in two formats:
          Legacy:  'Long term nursing, 12h, Registered Nurse'     -> treated as per month
          New:     'Long term nursing, per month, 12h, Registered Nurse'
                   'Long term nursing, per shift, 12h, Registered Nurse'
        Shifts: 8h, 12h, 24h.
        Roles: Registered Nurse (RN), Nursing Assistant, Nursing Attendant.
        Not offered: 8h Attendant, 24h RN -> returns None.
        """
        norm = (name_str or '').strip().lower()
        if not norm.startswith("long term nursing"):
            return None

        # Determine package type
        package_type = None
        if "per month" in norm:
            package_type = "per month"
        elif "per shift" in norm:
            package_type = "per shift"
        # Legacy format (no package type specified) -> default to per month
        if package_type is None:
            package_type = "per month"

        # Determine shift
        shift = None
        if "8h" in norm or "8 hour" in norm or "8-hour" in norm:
            shift = "8h"
        elif "12h" in norm or "12 hour" in norm or "12-hour" in norm:
            shift = "12h"
        elif "24h" in norm or "24 hour" in norm or "24-hour" in norm:
            shift = "24h"

        # Determine role
        role = None
        if "registered nurse" in norm or " rn" in norm or ",rn" in norm or norm.endswith("rn"):
            role = "rn"
        elif "nursing assistant" in norm or "assistant" in norm:
            role = "assistant"
        elif "nursing attendant" in norm or "attendant" in norm:
            role = "attendant"

        if not shift or not role:
            return None

        # Check not-offered combinations
        if (shift, role) in cls._LONG_TERM_NOT_OFFERED:
            return None

        canonical_name = cls._LONG_TERM_MAPPING.get((package_type, shift, role))
        if not canonical_name:
            return None
        return ("long_term", canonical_name)

    @classmethod
    def resolve_alias(cls, requested_name, service_type=None):
        """
        Resolves requested service name to a ServiceCatalogItem instance.
        Case-insensitive, trimmed.
        Ambiguous names use service_type to select the correct category.
        Returns ServiceCatalogItem instance, or None if unknown/unresolved (never guess).
        """
        if not requested_name or not str(requested_name).strip():
            return None

        clean = str(requested_name).strip()
        norm = clean.lower()

        # 1. Long Term Nursing pattern matching
        if norm.startswith("long term nursing"):
            lt_target = cls.resolve_long_term_nursing(norm)
            if lt_target:
                cat, item_name = lt_target
                return cls.objects.filter(is_active=True, category=cat, name__iexact=item_name).first()
            return None

        # 2. Match against ALIAS_MAP
        if norm in cls.ALIAS_MAP:
            mapping = cls.ALIAS_MAP[norm]
            if isinstance(mapping, dict):
                st_key = (service_type or '').strip().lower()
                if st_key in mapping:
                    cat, item_name = mapping[st_key]
                    return cls.objects.filter(is_active=True, category=cat, name__iexact=item_name).first()
                return None
            elif isinstance(mapping, tuple):
                cat, item_name = mapping
                return cls.objects.filter(is_active=True, category=cat, name__iexact=item_name).first()

        # 3. Direct match with ServiceCatalogItem.name (case-insensitive)
        query = cls.objects.filter(is_active=True, name__iexact=clean)
        if service_type:
            st_clean = service_type.strip().lower()
            cat_match = query.filter(category__iexact=st_clean).first()
            if cat_match:
                return cat_match
        exact_match = query.first()
        if exact_match:
            return exact_match

        # Unknown name: return None (never guess)
        return None

    def __str__(self):
        return f"{self.category}: {self.name} ({self.price_text or self.price_min or 'Custom'})"


