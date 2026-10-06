from django.contrib import admin
from .models import LabTest, LabOrder, LabReport


class LabReportInline(admin.StackedInline):
    model = LabReport
    extra = 0


@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    list_display = ['name', 'sample_type', 'price', 'turnaround_hours', 'is_active']
    list_filter = ['sample_type', 'is_active']
    search_fields = ['name', 'description']


@admin.register(LabOrder)
class LabOrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'patient', 'status', 'collection_staff', 'scheduled_collection_time', 'collected_at', 'total_price']
    list_filter = ['status', 'fasting_required']
    search_fields = ['patient__first_name', 'patient__last_name']
    inlines = [LabReportInline]


@admin.register(LabReport)
class LabReportAdmin(admin.ModelAdmin):
    list_display = ['id', 'lab_order', 'uploaded_by', 'flagged_abnormal', 'uploaded_at']
    list_filter = ['flagged_abnormal']
