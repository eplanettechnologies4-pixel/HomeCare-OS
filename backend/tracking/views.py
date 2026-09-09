import math

from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import GeofenceEvent, SOSEvent, AlertRule, LiveVisit
from .serializers import (
    GeofenceEventSerializer, SOSEventSerializer,
    AlertRuleSerializer, LiveVisitSerializer,
)



class GeofenceEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GeofenceEvent.objects.select_related('booking__patient', 'staff').all()
    serializer_class = GeofenceEventSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        booking_id = self.request.query_params.get('booking_id')
        staff_id = self.request.query_params.get('staff_id')
        event_type = self.request.query_params.get('event_type')
        if booking_id:
            qs = qs.filter(booking_id=booking_id)
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        if event_type:
            qs = qs.filter(event_type=event_type)
        return qs


class SOSEventViewSet(viewsets.ModelViewSet):
    queryset = SOSEvent.objects.select_related('booking__patient', 'staff').all()
    serializer_class = SOSEventSerializer

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        sos = self.get_object()
        sos.status = 'resolved'
        sos.resolved_at = timezone.now()
        sos.resolved_by = request.user
        sos.notes = request.data.get('notes', '')
        sos.save(update_fields=['status', 'resolved_at', 'resolved_by', 'notes'])
        return Response(SOSEventSerializer(sos).data)

    @action(detail=False, methods=['get'])
    def active(self, request):
        qs = self.get_queryset().filter(status='active')
        return Response(SOSEventSerializer(qs, many=True).data)


class AlertRuleViewSet(viewsets.ModelViewSet):
    queryset = AlertRule.objects.filter(is_active=True)
    serializer_class = AlertRuleSerializer


class LiveVisitViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LiveVisit.objects.select_related('booking__patient', 'staff').all()
    serializer_class = LiveVisitSerializer


# ── Utility ───────────────────────────────────────────────────────────────────

def _haversine_distance_meters(lat1, lon1, lat2, lon2) -> float:
    """Return the great-circle distance in metres between two GPS coordinates."""
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlambda = math.radians(float(lon2) - float(lon1))
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _get_geofence_radius() -> float:
    """Return the configured geofence check-in radius in metres (defaults to 100 m)."""
    rule = AlertRule.objects.first()
    return getattr(rule, 'geofence_radius_meters', 100.0)


def _get_staff_from_request(request):
    """Resolve the authenticated user to their StaffMember record."""
    from staff.models import StaffMember
    try:
        return StaffMember.objects.get(user=request.user)
    except StaffMember.DoesNotExist:
        return None


# ── 1. GPS PING ───────────────────────────────────────────────────────────────

class GPSPingView(APIView):
    """
    POST /api/tracking/gps-ping/
    Body: {"booking_id": <int>, "lat": <float>, "lng": <float>}

    - Updates the staff member's current_latitude/longitude on StaffMember.
    - Upserts a LiveVisit record with the new coordinates.
    - If the nurse is within the geofence radius AND the booking isn't already
      checked in, automatically fires a check-in (same logic as CheckInView).
    - The frontend live-tracking page continues to poll /api/tracking/live-visits/
      which now has fresh data from each ping.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from bookings.models import Booking, BookingStatus

        booking_id = request.data.get('booking_id')
        lat = request.data.get('lat')
        lng = request.data.get('lng')

        if not all([booking_id, lat is not None, lng is not None]):
            return Response(
                {'error': 'booking_id, lat and lng are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        staff = _get_staff_from_request(request)
        if staff is None:
            return Response({'error': 'No StaffMember profile found for this account.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            booking = Booking.objects.select_related('patient').get(pk=booking_id, assigned_staff=staff)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found or not assigned to you.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()

        # 1. Update staff position
        staff.current_latitude = lat
        staff.current_longitude = lng
        staff.save(update_fields=['current_latitude', 'current_longitude', 'updated_at'])

        # 2. Upsert LiveVisit
        live_visit, _ = LiveVisit.objects.update_or_create(
            booking=booking,
            defaults={'staff': staff, 'current_latitude': lat, 'current_longitude': lng},
        )

        # 3. Haversine geofence check (only if not already checked in)
        auto_checked_in = False
        if booking.patient.latitude and booking.patient.longitude:
            distance = _haversine_distance_meters(
                lat, lng,
                booking.patient.latitude, booking.patient.longitude,
            )
            already_checked_in = GeofenceEvent.objects.filter(
                booking=booking, event_type=GeofenceEvent.EventType.CHECK_IN
            ).exists()

            if distance <= _get_geofence_radius() and not already_checked_in:
                GeofenceEvent.objects.create(
                    booking=booking,
                    staff=staff,
                    event_type=GeofenceEvent.EventType.CHECK_IN,
                    timestamp=now,
                    latitude=lat,
                    longitude=lng,
                    notes='Auto check-in via GPS ping (geofence triggered)',
                )
                if booking.status in [BookingStatus.EN_ROUTE, BookingStatus.ASSIGNED]:
                    booking.status = BookingStatus.IN_PROGRESS
                    booking.actual_start_time = now
                    booking.save(update_fields=['status', 'actual_start_time'])
                auto_checked_in = True

        return Response({
            'status': 'ok',
            'auto_checked_in': auto_checked_in,
            'booking_status': booking.status,
            'distance_to_patient_meters': (
                round(_haversine_distance_meters(
                    lat, lng,
                    booking.patient.latitude, booking.patient.longitude,
                ), 1)
                if booking.patient.latitude else None
            ),
        })


# ── 2. CHECK IN ───────────────────────────────────────────────────────────────

class CheckInView(APIView):
    """
    POST /api/tracking/check-in/
    Body: {"booking_id": <int>, "lat": <float>, "lng": <float>,
           "method": "geofence_auto" | "manual"}

    Creates a check_in GeofenceEvent and transitions the booking to in_progress.
    Idempotent — if a check_in already exists for this booking, returns the
    existing record without creating a duplicate.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from bookings.models import Booking, BookingStatus

        booking_id = request.data.get('booking_id')
        lat = request.data.get('lat')
        lng = request.data.get('lng')
        method = request.data.get('method', 'manual')

        if not all([booking_id, lat is not None, lng is not None]):
            return Response(
                {'error': 'booking_id, lat and lng are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        staff = _get_staff_from_request(request)
        if staff is None:
            return Response({'error': 'No StaffMember profile found.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            booking = Booking.objects.get(pk=booking_id, assigned_staff=staff)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found or not assigned to you.'}, status=status.HTTP_404_NOT_FOUND)

        # Idempotency — return existing check-in if already recorded
        existing = GeofenceEvent.objects.filter(
            booking=booking, event_type=GeofenceEvent.EventType.CHECK_IN
        ).first()
        if existing:
            return Response({
                'detail': 'Already checked in.',
                'event': GeofenceEventSerializer(existing).data,
                'booking_status': booking.status,
            })

        now = timezone.now()
        event = GeofenceEvent.objects.create(
            booking=booking,
            staff=staff,
            event_type=GeofenceEvent.EventType.CHECK_IN,
            timestamp=now,
            latitude=lat,
            longitude=lng,
            notes=f'Check-in via {method}',
        )

        # Transition booking status
        if booking.status not in ['completed', 'cancelled']:
            booking.status = BookingStatus.IN_PROGRESS
            booking.actual_start_time = now
            booking.save(update_fields=['status', 'actual_start_time'])

        return Response({
            'event': GeofenceEventSerializer(event).data,
            'booking_status': booking.status,
            'checked_in_at': now.isoformat(),
        }, status=status.HTTP_201_CREATED)


# ── 3. CHECK OUT ──────────────────────────────────────────────────────────────

class CheckOutView(APIView):
    """
    POST /api/tracking/check-out/
    Body: {"booking_id": <int>, "lat": <float>, "lng": <float>}

    Creates a check_out GeofenceEvent, transitions booking to completed,
    records actual_end_time, and returns visit_duration_minutes so the
    mobile CheckoutScreen can display the real duration instead of a hardcoded value.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from bookings.models import Booking, BookingStatus

        booking_id = request.data.get('booking_id')
        lat = request.data.get('lat')
        lng = request.data.get('lng')

        if not all([booking_id, lat is not None, lng is not None]):
            return Response(
                {'error': 'booking_id, lat and lng are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        staff = _get_staff_from_request(request)
        if staff is None:
            return Response({'error': 'No StaffMember profile found.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            booking = Booking.objects.get(pk=booking_id, assigned_staff=staff)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found or not assigned to you.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        event = GeofenceEvent.objects.create(
            booking=booking,
            staff=staff,
            event_type=GeofenceEvent.EventType.CHECK_OUT,
            timestamp=now,
            latitude=lat,
            longitude=lng,
        )

        # Compute duration using actual_start_time (set at check-in)
        visit_duration_minutes = None
        if booking.actual_start_time:
            delta = now - booking.actual_start_time
            visit_duration_minutes = int(delta.total_seconds() / 60)

        # Transition to completed
        booking.status = BookingStatus.COMPLETED
        booking.actual_end_time = now
        booking.save(update_fields=['status', 'actual_end_time'])

        # Remove LiveVisit snapshot — visit is over
        LiveVisit.objects.filter(booking=booking).delete()

        # Update staff status back to available
        staff.status = 'available'
        staff.save(update_fields=['status'])

        return Response({
            'event': GeofenceEventSerializer(event).data,
            'booking_status': booking.status,
            'visit_duration_minutes': visit_duration_minutes,
            'checked_out_at': now.isoformat(),
        }, status=status.HTTP_201_CREATED)
