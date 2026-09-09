from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Branch(models.Model):
    name       = models.CharField(max_length=100)
    city       = models.CharField(max_length=100, default='Karachi')
    address    = models.TextField(blank=True)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.city})"


class UserRole(models.TextChoices):
    SUPER_ADMIN    = 'super_admin',    'Super Admin'
    ADMIN          = 'admin',          'Admin'
    BRANCH_MANAGER = 'branch_manager', 'Branch Manager'
    CARE_MANAGER   = 'care_manager',   'Care Manager'
    NURSE          = 'nurse',          'Nurse / Doctor'
    ACCOUNTANT     = 'accountant',     'Accountant'
    CRM_EXECUTIVE  = 'crm_executive',  'CRM Executive'
    PATIENT_FAMILY = 'patient_family', 'Patient / Family'


class UserProfile(models.Model):
    user        = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    phone       = models.CharField(max_length=30, blank=True)
    role        = models.CharField(max_length=30, choices=UserRole.choices, default=UserRole.NURSE)
    branch      = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True)
    status      = models.CharField(max_length=20, default='active', choices=[('active', 'Active'), ('suspended', 'Suspended')])
    temp_password = models.CharField(max_length=100, blank=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.user.get_full_name()} ({self.get_role_display()})"


class RolePermission(models.Model):
    role        = models.CharField(max_length=30, choices=UserRole.choices)
    module_name = models.CharField(max_length=50) # e.g. 'bookings', 'patients', 'billing'
    can_view    = models.BooleanField(default=True)
    can_add     = models.BooleanField(default=False)
    can_edit    = models.BooleanField(default=False)
    can_delete  = models.BooleanField(default=False)

    class Meta:
        unique_together = ('role', 'module_name')


class AuditLog(models.Model):
    actor       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='performed_audit_logs')
    actor_name  = models.CharField(max_length=150)
    action      = models.CharField(max_length=100) # e.g. 'Created User', 'Suspended Account', 'Modified Permissions'
    target_user = models.CharField(max_length=150, blank=True)
    details     = models.TextField(blank=True)
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    timestamp   = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp}] {self.actor_name}: {self.action} on {self.target_user}"


class Payment(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'Cash'
        BANK_TRANSFER = 'bank_transfer', 'Bank Transfer'
        CARD = 'card', 'Card'
        INSURANCE = 'insurance', 'Insurance'

    booking = models.ForeignKey('bookings.Booking', on_delete=models.CASCADE, related_name='payments')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    received_at = models.DateTimeField()
    reference_number = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    received_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-received_at']

    def __str__(self):
        return f"Payment #{self.pk} — {self.patient} — {self.amount}"


class Invoice(models.Model):
    class InvoiceStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SENT = 'sent', 'Sent'
        PAID = 'paid', 'Paid'
        OVERDUE = 'overdue', 'Overdue'
        WAIVED = 'waived', 'Waived'

    booking = models.OneToOneField('bookings.Booking', on_delete=models.CASCADE, related_name='invoice')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='invoices')
    invoice_number = models.CharField(max_length=30, unique=True)
    issued_date = models.DateField()
    due_date = models.DateField()
