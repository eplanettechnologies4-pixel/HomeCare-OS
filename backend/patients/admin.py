from django.contrib import admin
from django.core.exceptions import ValidationError
from .models import (
    Patient, Prescription, VitalSign, NurseNote, LabResult, DailyReport,
    MARAdministration, DoctorNote, PhysioNote, TherapyNote, ClinicalConsent
)

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('mr_number', 'patient_code', 'first_name', 'last_name', 'gender', 'is_active')
    search_fields = ('mr_number', 'patient_code', 'first_name', 'last_name')


class SignedClinicalEntryAdmin(admin.ModelAdmin):
    """
    Django Admin configuration enforcing Phase 1 clinical entry immutability:
    - Signed entries cannot be deleted (delete permission revoked).
    - Signed entries have all fields locked as read-only except addenda.
    """
    def has_delete_permission(self, request, obj=None):
        if obj and getattr(obj, 'is_signed', False):
            return False
        return super().has_delete_permission(request, obj)

    def get_readonly_fields(self, request, obj=None):
        ro = list(super().get_readonly_fields(request, obj))
        if obj and getattr(obj, 'is_signed', False):
            # All fields except addenda are readonly once digitally signed
            for f in obj._meta.fields:
                if f.name != 'addenda' and f.name not in ro:
                    ro.append(f.name)
        return ro

    def delete_model(self, request, obj):
        if getattr(obj, 'is_signed', False):
            raise ValidationError("Signed clinical entries are permanently locked and cannot be deleted.")
        super().delete_model(request, obj)


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


admin.site.register(VitalSign)
admin.site.register(NurseNote)
admin.site.register(Prescription)
admin.site.register(DailyReport)
admin.site.register(MARAdministration)
