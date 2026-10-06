from django.contrib import admin
from .models import Medicine, MedicineOrder, MedicineOrderItem


class MedicineOrderItemInline(admin.TabularInline):
    model = MedicineOrderItem
    extra = 0


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ['name', 'generic_name', 'category', 'unit_price', 'stock_quantity', 'requires_prescription', 'is_active']
    list_filter = ['category', 'requires_prescription', 'is_active']
    search_fields = ['name', 'generic_name']


@admin.register(MedicineOrder)
class MedicineOrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'patient', 'status', 'total_amount', 'delivery_staff', 'payment_status', 'created_at']
    list_filter = ['status', 'payment_status']
    search_fields = ['patient__first_name', 'patient__last_name', 'delivery_address']
    inlines = [MedicineOrderItemInline]
