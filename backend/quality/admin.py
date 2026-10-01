from django.contrib import admin
from .models import VisitFeedback, ManagerVisitChecklist


@admin.register(VisitFeedback)
class VisitFeedbackAdmin(admin.ModelAdmin):
    list_display = ['id', 'patient', 'staff', 'submitted_by', 'average_rating_score', 'created_at']
    list_filter = ['rating_overall', 'created_at']
    search_fields = ['patient__first_name', 'patient__last_name', 'staff__first_name', 'staff__last_name']
    readonly_fields = ['submitted_by', 'created_at', 'updated_at', 'manager_signed_at']


@admin.register(ManagerVisitChecklist)
class ManagerVisitChecklistAdmin(admin.ModelAdmin):
    list_display = ['id', 'patient', 'staff', 'manager', 'visit_date', 'created_at']
    list_filter = ['visit_date', 'created_at']
    search_fields = ['patient__first_name', 'patient__last_name', 'staff__first_name']
    readonly_fields = ['manager', 'created_at', 'updated_at']
