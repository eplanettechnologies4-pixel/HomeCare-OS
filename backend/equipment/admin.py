from django.contrib import admin
from .models import EquipmentItem, EquipmentRental


@admin.register(EquipmentItem)
class EquipmentItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'daily_rate', 'monthly_rate', 'security_deposit', 'available_units', 'total_units', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'description']


@admin.register(EquipmentRental)
class EquipmentRentalAdmin(admin.ModelAdmin):
    list_display = ['id', 'patient', 'equipment', 'status', 'rental_start', 'rental_end', 'deposit_amount', 'deposit_refunded', 'delivery_staff']
    list_filter = ['status', 'deposit_refunded']
    search_fields = ['patient__first_name', 'patient__last_name', 'equipment__name']
