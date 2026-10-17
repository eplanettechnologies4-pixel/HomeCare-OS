from django.contrib import admin
from .models import Booking, ServiceCatalogItem


@admin.register(ServiceCatalogItem)
class ServiceCatalogItemAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'category', 'name', 'price_min', 'price_max', 'price_text',
        'sort_order', 'is_active', 'updated_at'
    ]
    list_editable = ['price_min', 'price_max', 'price_text', 'sort_order', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'category', 'caption', 'price_text']
    ordering = ['sort_order', 'category', 'name']


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = [
        'reference_code', 'patient', 'service_type', 'requested_item',
        'service_mode', 'provider_level', 'shift_role', 'rental_period',
        'estimated_price', 'amount', 'status', 'scheduled_time'
    ]
    list_filter = ['service_type', 'status', 'service_mode', 'provider_level', 'shift_role', 'rental_period']
    search_fields = ['reference_code', 'patient__first_name', 'patient__last_name', 'requested_item']
