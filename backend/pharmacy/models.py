from django.db import models
from django.utils import timezone


class MedicineCategory(models.TextChoices):
    ANALGESICS = 'analgesics', 'Analgesics & Pain Relief'
    ANTIBIOTICS = 'antibiotics', 'Antibiotics'
    CARDIAC = 'cardiac', 'Cardiovascular & Hypertension'
    DIABETES = 'diabetes', 'Diabetes Care'
    RESPIRATORY = 'respiratory', 'Respiratory & Inhalers'
    GASTRO = 'gastro', 'Gastrointestinal'
    VITAMINS = 'vitamins', 'Vitamins & Supplements'
    GENERAL = 'general', 'General Medicine'


class Medicine(models.Model):
    name = models.CharField(max_length=200, db_index=True)
    generic_name = models.CharField(max_length=200, blank=True, db_index=True)
    requires_prescription = models.BooleanField(default=False)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    stock_quantity = models.IntegerField(default=0)
    category = models.CharField(max_length=50, choices=MedicineCategory.choices, default=MedicineCategory.GENERAL)
    dosage_form = models.CharField(max_length=100, blank=True, default='Tablet')  # Tablet, Syrup, Injection, etc.
    strength = models.CharField(max_length=100, blank=True)  # 500mg, 10ml, etc.
    manufacturer = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.generic_name}) - PKR {self.unit_price}"


class MedicineOrderStatus(models.TextChoices):
    PENDING = 'pending', 'Pending Review'
    CONFIRMED = 'confirmed', 'Confirmed'
    OUT_FOR_DELIVERY = 'out_for_delivery', 'Out for Delivery'
    DELIVERED = 'delivered', 'Delivered'
    CANCELLED = 'cancelled', 'Cancelled'


class MedicinePaymentStatus(models.TextChoices):
    UNPAID = 'unpaid', 'Unpaid'
    PAID = 'paid', 'Paid'
    COD = 'cod', 'Cash on Delivery'


class MedicineOrder(models.Model):
    patient = models.ForeignKey(
        'patients.Patient', on_delete=models.CASCADE, related_name='medicine_orders'
    )
    prescription_file = models.FileField(
        upload_to='prescriptions/orders/%Y/%m/', null=True, blank=True
    )
    status = models.CharField(
        max_length=30,
        choices=MedicineOrderStatus.choices,
        default=MedicineOrderStatus.PENDING,
        db_index=True
    )
    delivery_address = models.TextField()
    delivery_staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='medicine_deliveries'
    )
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payment_status = models.CharField(
        max_length=20,
        choices=MedicinePaymentStatus.choices,
        default=MedicinePaymentStatus.UNPAID
    )
    
    # GPS Delivery Verification
    delivery_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    delivery_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    delivery_notes = models.TextField(blank=True)
    
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Order #{self.pk} - {self.patient.full_name} ({self.status})"

    def calculate_total(self):
        total = sum(item.quantity * item.price_at_order for item in self.items.all())
        self.total_amount = total
        self.save(update_fields=['total_amount'])
        return total

    @property
    def has_prescription_required_items(self):
        return self.items.filter(medicine__requires_prescription=True).exists()


class MedicineOrderItem(models.Model):
    order = models.ForeignKey(
        MedicineOrder, on_delete=models.CASCADE, related_name='items'
    )
    medicine = models.ForeignKey(
        Medicine, on_delete=models.PROTECT, related_name='order_items'
    )
    quantity = models.PositiveIntegerField(default=1)
    price_at_order = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.medicine.name} x {self.quantity} (@ {self.price_at_order})"

    def save(self, *args, **kwargs):
        if not self.price_at_order:
            self.price_at_order = self.medicine.unit_price
        super().save(*args, **kwargs)
