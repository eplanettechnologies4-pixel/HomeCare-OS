from django.db import models
from django.utils import timezone
import uuid


class InvoiceStatus(models.TextChoices):
    DRAFT   = 'draft',   'Draft'
    PENDING = 'pending', 'Pending'
    PARTIAL = 'partial', 'Partial'
    PAID    = 'paid',    'Paid'
    OVERDUE = 'overdue', 'Overdue'
    WAIVED  = 'waived',  'Waived'


class BillingType(models.TextChoices):
    MONTHLY = 'monthly', 'Monthly Package'
    VISIT   = 'visit',   'Per Visit'
    ONE_OFF = 'one_off', 'One-Off Service'


class Invoice(models.Model):
    invoice_number = models.CharField(max_length=30, unique=True)
    patient        = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='billing_invoices')
    booking        = models.ForeignKey('bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='billing_invoices')
    billing_type   = models.CharField(max_length=20, choices=BillingType.choices, default=BillingType.VISIT)
    status         = models.CharField(max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.PENDING)

    issued_date    = models.DateField(default=timezone.now)
    due_date       = models.DateField()
    period_from    = models.DateField(null=True, blank=True)
    period_to      = models.DateField(null=True, blank=True)

    subtotal       = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount       = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax            = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total          = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid    = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    notes          = models.TextField(blank=True)
    created_by     = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-issued_date']

    def __str__(self):
        return f"{self.invoice_number} — {self.patient}"

    @property
    def balance_due(self):
        return self.total - self.amount_paid

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            count = Invoice.objects.count() + 1
            self.invoice_number = f"INV-{timezone.now().year}-{count:04d}"
        # Auto-compute total
        self.total = self.subtotal - self.discount + self.tax
        # Update status based on payment
        if self.amount_paid >= self.total:
            self.status = InvoiceStatus.PAID
        elif self.amount_paid > 0:
            self.status = InvoiceStatus.PARTIAL
        super().save(*args, **kwargs)


class InvoiceLineItem(models.Model):
    invoice     = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='line_items')
    description = models.CharField(max_length=255)
    quantity    = models.DecimalField(max_digits=8, decimal_places=2, default=1)
    unit_price  = models.DecimalField(max_digits=10, decimal_places=2)
    amount      = models.DecimalField(max_digits=12, decimal_places=2)

    def save(self, *args, **kwargs):
        self.amount = self.quantity * self.unit_price
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['id']


class BillingPayment(models.Model):
    class Method(models.TextChoices):
        CASH          = 'cash',          'Cash'
        BANK_TRANSFER = 'bank_transfer', 'Bank Transfer'
        CARD          = 'card',          'Card'
        INSURANCE     = 'insurance',     'Insurance'
        ONLINE        = 'online',        'Online Payment'

    invoice         = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='billing_payments')
    patient         = models.ForeignKey('patients.Patient', on_delete=models.CASCADE)
    amount          = models.DecimalField(max_digits=12, decimal_places=2)
    method          = models.CharField(max_length=20, choices=Method.choices)
    received_at     = models.DateTimeField()
    reference       = models.CharField(max_length=100, blank=True)
    received_by     = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    notes           = models.TextField(blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-received_at']
