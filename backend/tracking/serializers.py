from rest_framework import serializers
from .models import GeofenceEvent, SOSEvent, AlertRule, LiveVisit


class GeofenceEventSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    patient_name = serializers.CharField(source='booking.patient.full_name', read_only=True)
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    visit_duration_minutes = serializers.ReadOnlyField()

    class Meta:
        model = GeofenceEvent
        fields = '__all__'


class SOSEventSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    patient_name = serializers.CharField(source='booking.patient.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = SOSEvent
        fields = '__all__'


class AlertRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertRule
        fields = '__all__'


class LiveVisitSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    staff_role = serializers.CharField(source='staff.role', read_only=True)
    staff_photo = serializers.ImageField(source='staff.photo', read_only=True)
    patient_name = serializers.CharField(source='booking.patient.full_name', read_only=True)
    booking_status = serializers.CharField(source='booking.status', read_only=True)
    scheduled_time = serializers.DateTimeField(source='booking.scheduled_time', read_only=True)
    patient_address = serializers.CharField(source='booking.address', read_only=True)
    patient_lat = serializers.DecimalField(source='booking.latitude', max_digits=9, decimal_places=6, read_only=True)
    patient_lng = serializers.DecimalField(source='booking.longitude', max_digits=9, decimal_places=6, read_only=True)

    class Meta:
        model = LiveVisit
        fields = '__all__'
