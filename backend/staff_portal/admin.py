from django.contrib import admin
from .models import (
    StaffRequest, OvertimeClaim, Complaint, ResignationRequest,
    CompanyPolicy, PolicyAcknowledgement, FamilyConcern
)


@admin.register(StaffRequest)
class StaffRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'staff', 'request_type', 'patient', 'urgency', 'status', 'created_at')
    list_filter = ('request_type', 'status', 'urgency', 'created_at')
    search_fields = ('staff__first_name', 'staff__last_name', 'patient__first_name', 'patient__last_name', 'notes')


@admin.register(OvertimeClaim)
class OvertimeClaimAdmin(admin.ModelAdmin):
    list_display = ('id', 'staff', 'date', 'hours', 'derived_max_hours', 'status', 'reviewer', 'reviewed_at')
    list_filter = ('status', 'date')
    search_fields = ('staff__first_name', 'staff__last_name', 'reason')


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ('id', 'staff', 'subject', 'category', 'status', 'created_at', 'resolved_by')
    list_filter = ('status', 'category')
    search_fields = ('staff__first_name', 'staff__last_name', 'subject', 'description')


@admin.register(ResignationRequest)
class ResignationRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'staff', 'notice_period_days', 'last_working_day', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('staff__first_name', 'staff__last_name', 'reason')


@admin.register(CompanyPolicy)
class CompanyPolicyAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'version', 'effective_date', 'is_active')
    list_filter = ('is_active', 'category')
    search_fields = ('title', 'summary', 'content')
    prepopulated_fields = {'slug': ('title',)}


@admin.register(PolicyAcknowledgement)
class PolicyAcknowledgementAdmin(admin.ModelAdmin):
    list_display = ('policy', 'staff', 'acknowledged_at')
    list_filter = ('acknowledged_at',)
    search_fields = ('staff__first_name', 'staff__last_name', 'policy__title')


@admin.register(FamilyConcern)
class FamilyConcernAdmin(admin.ModelAdmin):
    list_display = ('id', 'patient', 'chart_type', 'raised_by', 'status', 'created_at')
    list_filter = ('chart_type', 'status', 'created_at')
    search_fields = ('patient__first_name', 'patient__last_name', 'message')
