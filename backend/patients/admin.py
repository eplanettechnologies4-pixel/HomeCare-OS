from django.contrib import admin
from .models import Patient, Prescription, VitalSign, NurseNote, LabResult, DailyReport, MARAdministration, DoctorNote, PhysioNote

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('mr_number', 'patient_code', 'first_name', 'last_name', 'gender', 'is_active')
    search_fields = ('mr_number', 'patient_code', 'first_name', 'last_name')

admin.site.register(DoctorNote)
admin.site.register(PhysioNote)
admin.site.register(VitalSign)
admin.site.register(NurseNote)
admin.site.register(Prescription)
admin.site.register(DailyReport)
admin.site.register(MARAdministration)
