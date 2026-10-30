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
        'reference_code', 'patient', 'service_type', 'assigned_staff',
        'supervisor', 'buddy_staff', 'transport_driver_name',
        'amount', 'status', 'scheduled_time'
    ]
    list_filter = ['service_type', 'status', 'service_mode', 'provider_level', 'shift_role']
    search_fields = ['reference_code', 'patient__first_name', 'patient__last_name', 'transport_driver_name']
    fieldsets = (
        ('Patient & Service', {
            'fields': ('patient', 'service_type', 'status', 'scheduled_time', 'shift_duration', 'shift_end_time')
        }),
        ('Shift Staffing & Coordination', {
            'fields': ('assigned_staff', 'supervisor', 'buddy_staff', 'backup_staff', 'care_manager_name')
        }),
        ('Shift Transport & Driver', {
            'fields': ('transport_driver_name', 'transport_driver_phone', 'transport_pickup_time')
        }),
        ('Financials', {
            'fields': ('amount', 'amount_paid', 'payment_status', 'payment_method')
        }),
        ('Clinical & Notes', {
            'fields': ('address', 'diagnosis', 'allergies', 'notes', 'handover_notes')
        }),
    )
