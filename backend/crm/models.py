from django.db import models
from django.utils import timezone


class LeadStage(models.TextChoices):
    NEW_LEAD   = 'new_lead',   'New Lead'
    CONTACTED  = 'contacted',  'Contacted'
    FOLLOW_UP  = 'follow_up',  'Follow-up'
    CONVERTED  = 'converted',  'Converted'


class Lead(models.Model):
    name           = models.CharField(max_length=150)
    phone          = models.CharField(max_length=30)
    email          = models.EmailField(blank=True)
    source         = models.CharField(max_length=100, default='Website')
    stage          = models.CharField(max_length=20, choices=LeadStage.choices, default=LeadStage.NEW_LEAD)
    assigned_to    = models.ForeignKey('staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_leads')
    notes          = models.TextField(blank=True)
    service_needed = models.CharField(max_length=100, blank=True)
    
    # Linked records if converted
    converted_patient = models.ForeignKey('patients.Patient', on_delete=models.SET_NULL, null=True, blank=True, related_name='originating_leads')
    converted_booking = models.ForeignKey('bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='originating_leads')
    
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.get_stage_display()})"


class LeadActivity(models.Model):
    lead       = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='activities')
    author     = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    note       = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
