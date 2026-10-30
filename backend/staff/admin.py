from django.contrib import admin
from .models import StaffMember, AttendanceRecord, LeaveRequest


@admin.register(StaffMember)
class StaffMemberAdmin(admin.ModelAdmin):
    list_display = [
        'employee_id', 'first_name', 'last_name', 'role', 'status',
        'phone', 'transport_driver_name', 'is_active'
    ]
    list_filter = ['role', 'status', 'is_active', 'platform_allowed']
    search_fields = ['employee_id', 'first_name', 'last_name', 'phone', 'email']
    fieldsets = (
        ('Basic Info', {
            'fields': ('user', 'first_name', 'last_name', 'employee_id', 'role', 'designation', 'specialization', 'is_active')
        }),
        ('Contact & Employment', {
            'fields': ('phone', 'email', 'status', 'hire_date', 'hourly_rate', 'rating', 'platform_allowed')
        }),
        ('Default Staff Transport & Buddy (Fallback)', {
            'fields': ('transport_driver_name', 'transport_driver_phone', 'transport_pickup_time', 'buddy_staff')
        }),
        ('Identification & Media', {
            'fields': ('photo', 'id_card_front', 'id_card_back', 'verification_token')
        }),
    )


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ['staff', 'date', 'check_in', 'check_out', 'visits_completed', 'total_hours']
    list_filter = ['date']
    search_fields = ['staff__first_name', 'staff__last_name', 'staff__employee_id']


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ['staff', 'leave_type', 'start_date', 'end_date', 'status']
    list_filter = ['status', 'leave_type']
    search_fields = ['staff__first_name', 'staff__last_name', 'staff__employee_id']
