from django.contrib import admin
from django.core.exceptions import ValidationError
from .models import (
    Patient, Prescription, VitalSign, NurseNote, LabResult, DailyReport,
    MARAdministration, DoctorNote, PhysioNote, TherapyNote, ClinicalConsent,
    ScheduledItem
)

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('mr_number', 'patient_code', 'first_name', 'last_name', 'gender', 'is_active')
    search_fields = ('mr_number', 'patient_code', 'first_name', 'last_name')


class SignedClinicalEntryAdmin(admin.ModelAdmin):
    """
    Django Admin configuration enforcing Phase 1 clinical entry immutability:
    - Clinical entries cannot be deleted (delete permission revoked).
    - Signed entries have all fields locked as read-only except addenda.
    """
    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        ro = list(super().get_readonly_fields(request, obj))
        if obj and getattr(obj, 'is_signed', False):
            # All fields except addenda are readonly once digitally signed
            for f in obj._meta.fields:
                if f.name != 'addenda' and f.name not in ro:
                    ro.append(f.name)
        return ro

    def delete_model(self, request, obj):
        raise ValidationError("Physical deletion of clinical entries is prohibited.")


@admin.register(DoctorNote)
class DoctorNoteAdmin(SignedClinicalEntryAdmin):
    list_display = ('id', 'patient', 'doctor', 'is_signed', 'signed_at', 'created_at')
    list_filter = ('is_signed', 'created_at')
    search_fields = ('patient__first_name', 'patient__last_name', 'doctor__full_name')


@admin.register(PhysioNote)
class PhysioNoteAdmin(SignedClinicalEntryAdmin):
    list_display = ('id', 'patient', 'physio', 'is_signed', 'signed_at', 'created_at')
    list_filter = ('is_signed', 'created_at')
    search_fields = ('patient__first_name', 'patient__last_name', 'physio__full_name')


@admin.register(TherapyNote)
class TherapyNoteAdmin(SignedClinicalEntryAdmin):
    list_display = ('id', 'patient', 'discipline', 'author', 'is_signed', 'signed_at', 'created_at')
    list_filter = ('discipline', 'is_signed', 'created_at')
    search_fields = ('patient__first_name', 'patient__last_name', 'author__full_name')


@admin.register(ClinicalConsent)
class ClinicalConsentAdmin(SignedClinicalEntryAdmin):
    list_display = ('id', 'patient', 'title', 'consent_type', 'is_granted', 'is_signed', 'signed_at')
    list_filter = ('consent_type', 'is_granted', 'is_signed')
    search_fields = ('patient__first_name', 'patient__last_name', 'title')


class ClinicalRecordAdmin(admin.ModelAdmin):
    """Revokes physical delete permission across all clinical records in Django admin."""
    def has_delete_permission(self, request, obj=None):
        return False

    def delete_model(self, request, obj):
        raise ValidationError("Physical deletion of clinical records is prohibited. Use mark-entered-in-error.")


@admin.register(VitalSign)
class VitalSignAdmin(ClinicalRecordAdmin):
    list_display = ('id', 'patient', 'recorded_by', 'recorded_at', 'blood_pressure_systolic', 'blood_pressure_diastolic', 'is_entered_in_error')
    list_filter = ('is_entered_in_error', 'recorded_at')
    search_fields = ('patient__first_name', 'patient__last_name')


@admin.register(NurseNote)
class NurseNoteAdmin(ClinicalRecordAdmin):
    list_display = ('id', 'patient', 'recorded_by', 'recorded_at', 'is_entered_in_error')
    list_filter = ('is_entered_in_error', 'recorded_at')
    search_fields = ('patient__first_name', 'patient__last_name')


@admin.register(Prescription)
class PrescriptionAdmin(ClinicalRecordAdmin):
    list_display = ('id', 'patient', 'medication', 'dosage', 'verification_status', 'prescribed_by', 'date')
    list_filter = ('verification_status', 'date')
    search_fields = ('patient__first_name', 'patient__last_name', 'medication')


@admin.register(DailyReport)
class DailyReportAdmin(ClinicalRecordAdmin):
    list_display = ('id', 'patient', 'submitted_by', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('patient__first_name', 'patient__last_name')


@admin.register(MARAdministration)
class MARAdministrationAdmin(ClinicalRecordAdmin):
    list_display = ('id', 'prescription', 'day_number', 'administered_by', 'administered_at', 'is_entered_in_error')
    list_filter = ('is_entered_in_error', 'administered_at')


@admin.register(LabResult)
class LabResultAdmin(ClinicalRecordAdmin):
    list_display = ('id', 'patient', 'test_name', 'result_value', 'collected_at', 'is_entered_in_error')
    list_filter = ('is_entered_in_error', 'collected_at')
    search_fields = ('patient__first_name', 'patient__last_name', 'test_name')


@admin.register(ScheduledItem)
class ScheduledItemAdmin(ClinicalRecordAdmin):
    list_display = ('id', 'patient', 'kind', 'title', 'due_at', 'status', 'is_entered_in_error')
    list_filter = ('kind', 'status', 'is_entered_in_error')
    search_fields = ('patient__first_name', 'patient__last_name', 'title')
