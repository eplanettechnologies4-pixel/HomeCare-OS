from django.db import models
from django.utils import timezone


class LabTest(models.Model):
    name = models.CharField(max_length=200, db_index=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    sample_type = models.CharField(max_length=50, default='Blood')  # Blood, Urine, Sputum, etc.
    turnaround_hours = models.PositiveIntegerField(default=24)
    description = models.TextField(blank=True)
    preparation_instructions = models.TextField(blank=True)  # e.g. Fasting 10-12 hours required
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.sample_type}) - PKR {self.price}"


class LabOrderStatus(models.TextChoices):
    REQUESTED = 'requested', 'Requested'
    COLLECTOR_ASSIGNED = 'collector_assigned', 'Collector Assigned'
    SAMPLE_COLLECTED = 'sample_collected', 'Sample Collected'
    PROCESSING = 'processing', 'Processing in Lab'
    REPORT_READY = 'report_ready', 'Report Ready'
    DELIVERED = 'delivered', 'Delivered to Patient'
    CANCELLED = 'cancelled', 'Cancelled'


class LabOrder(models.Model):
    patient = models.ForeignKey(
        'patients.Patient', on_delete=models.CASCADE, related_name='lab_orders'
    )
    tests = models.ManyToManyField(LabTest, related_name='orders')
    status = models.CharField(
        max_length=30,
        choices=LabOrderStatus.choices,
        default=LabOrderStatus.REQUESTED,
        db_index=True
    )
    collection_staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sample_collections'
    )
    scheduled_collection_time = models.DateTimeField()
    
    # Immutable server timestamp (Item 18 & 43 EMR immutability rule)
    collected_at = models.DateTimeField(null=True, blank=True, editable=False)
    collection_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    collection_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    collection_notes = models.TextField(blank=True)
    
    collection_address = models.TextField(blank=True)
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    fasting_required = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Lab Order #{self.pk} - {self.patient.full_name} ({self.status})"

    @property
    def tests_summary(self):
        return ", ".join([t.name for t in self.tests.all()])

    def calculate_total(self):
        total = sum(t.price for t in self.tests.all())
        self.total_price = total
        self.save(update_fields=['total_price'])
        return total


class LabReport(models.Model):
    lab_order = models.ForeignKey(
        LabOrder, on_delete=models.CASCADE, related_name='reports'
    )
    result_file = models.FileField(upload_to='lab_reports/%Y/%m/', null=True, blank=True)
    result_data = models.JSONField(default=dict, blank=True)  # Structured parameters e.g. {"Hemoglobin": "13.2 g/dL"}
    uploaded_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='uploaded_lab_reports'
    )
    flagged_abnormal = models.BooleanField(default=False)
    clinical_remarks = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        abnormal_tag = " [ABNORMAL]" if self.flagged_abnormal else ""
        return f"Report #{self.pk} for Order #{self.lab_order_id}{abnormal_tag}"
