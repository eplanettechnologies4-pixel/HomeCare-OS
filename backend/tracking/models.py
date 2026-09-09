from django.db import models


class GeofenceEvent(models.Model):
    class EventType(models.TextChoices):
        CHECK_IN = 'check_in', 'Check In (Arrived)'
        CHECK_OUT = 'check_out', 'Check Out (Departed)'
        EN_ROUTE = 'en_route', 'En Route'
        SOS = 'sos', 'SOS Triggered'

    booking = models.ForeignKey('bookings.Booking', on_delete=models.CASCADE, related_name='geofence_events')
    staff = models.ForeignKey('staff.StaffMember', on_delete=models.CASCADE, related_name='geofence_events')
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    timestamp = models.DateTimeField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    accuracy_meters = models.FloatField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.event_type} — {self.staff} — {self.timestamp:%Y-%m-%d %H:%M}"

    @property
    def visit_duration_minutes(self):
        """Compute visit duration from matching check-in/out pair."""
        if self.event_type != 'check_out':
            return None
        check_in = GeofenceEvent.objects.filter(
            booking=self.booking,
            event_type='check_in',
        ).first()
        if check_in:
            delta = self.timestamp - check_in.timestamp
            return int(delta.total_seconds() / 60)
        return None


class SOSEvent(models.Model):
    class SOSStatus(models.TextChoices):
        ACTIVE = 'active', 'Active'
        RESOLVED = 'resolved', 'Resolved'

    booking = models.ForeignKey('bookings.Booking', on_delete=models.CASCADE, null=True, blank=True)
    staff = models.ForeignKey('staff.StaffMember', on_delete=models.CASCADE, related_name='sos_events')
    triggered_at = models.DateTimeField(auto_now_add=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    status = models.CharField(max_length=20, choices=SOSStatus.choices, default=SOSStatus.ACTIVE)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='resolved_sos'
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-triggered_at']


class AlertRule(models.Model):
    """Admin-configurable thresholds for automated alerts."""
    name = models.CharField(max_length=100, default='Default Rules')
    late_arrival_minutes = models.IntegerField(default=15, help_text='Minutes past scheduled time before flagging late')
    no_show_minutes = models.IntegerField(default=60, help_text='Minutes past scheduled time before flagging no-show')
    overstay_minutes = models.IntegerField(default=30, help_text='Minutes past expected duration before flagging overstay')
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class LiveVisit(models.Model):
    """Snapshot of a currently active visit for the live tracking board."""
    booking = models.OneToOneField('bookings.Booking', on_delete=models.CASCADE, related_name='live_visit')
    staff = models.ForeignKey('staff.StaffMember', on_delete=models.CASCADE)
    current_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    current_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    eta_minutes = models.IntegerField(null=True, blank=True)
    last_update = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Live: {self.staff} → {self.booking.patient}"
