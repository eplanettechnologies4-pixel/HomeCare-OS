from django.db import models
from django.utils import timezone


class EquipmentItem(models.Model):
    name = models.CharField(max_length=200, db_index=True)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=100, default='Mobility & Respiratory')
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    weekly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    monthly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    security_deposit = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    total_units = models.PositiveIntegerField(default=1)
    available_units = models.PositiveIntegerField(default=1)
    image = models.FileField(upload_to='equipment/', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.available_units}/{self.total_units} available)"


class EquipmentRentalStatus(models.TextChoices):
    REQUESTED = 'requested', 'Requested'
    DELIVERED = 'delivered', 'Delivered'
    ACTIVE = 'active', 'Active'
    PICKUP_PENDING = 'pickup_pending', 'Pickup Pending'
    RETURNED = 'returned', 'Returned'
    CANCELLED = 'cancelled', 'Cancelled'


class EquipmentRental(models.Model):
    patient = models.ForeignKey(
        'patients.Patient', on_delete=models.CASCADE, related_name='equipment_rentals'
    )
    equipment = models.ForeignKey(
        EquipmentItem, on_delete=models.PROTECT, related_name='rentals'
    )
    rental_start = models.DateField()
    rental_end = models.DateField()
    status = models.CharField(
        max_length=30,
        choices=EquipmentRentalStatus.choices,
        default=EquipmentRentalStatus.REQUESTED,
        db_index=True
    )
    delivery_staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='equipment_deliveries'
    )
    pickup_staff = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='equipment_pickups'
    )
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    deposit_refunded = models.BooleanField(default=False)
    rental_rate_type = models.CharField(
        max_length=20,
        choices=[('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly')],
        default='daily'
    )
    total_rental_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    delivery_address = models.TextField(blank=True)
    
    # Delivery GPS Verification
    delivery_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    delivery_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    delivery_notes = models.TextField(blank=True)
    
    # Pickup GPS Verification
    pickup_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    pickup_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True)
    pickup_notes = models.TextField(blank=True)

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Rental #{self.pk} - {self.equipment.name} for {self.patient.full_name} ({self.status})"

    def calculate_estimated_fee(self):
        """Calculate rental fee based on duration and chosen rate."""
        days = max(1, (self.rental_end - self.rental_start).days)
        if self.rental_rate_type == 'monthly':
            months = max(1, round(days / 30))
            self.total_rental_fee = months * self.equipment.monthly_rate
        elif self.rental_rate_type == 'weekly':
            weeks = max(1, round(days / 7))
            self.total_rental_fee = weeks * self.equipment.weekly_rate
        else:
            self.total_rental_fee = days * self.equipment.daily_rate
        return self.total_rental_fee
