import math
import logging
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import GeofenceEvent, SOSEvent, AlertRule, LiveVisit, LocationPing
from .serializers import (
    GeofenceEventSerializer, SOSEventSerializer,
    AlertRuleSerializer, LiveVisitSerializer,
)

logger = logging.getLogger(__name__)


def _broadcast_to_channel_layer(message_dict):
    """Safely broadcast a message to the 'tracking' WebSocket group."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)('tracking', message_dict)
    except Exception as e:
        logger.warning("Channel layer broadcast failed: %s", e)


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

    def create(self, request, *args, **kwargs):
        from bookings.models import Booking
        from staff.models import StaffMember

        data = request.data
        booking_id = data.get('booking_id') or data.get('booking')
        lat = data.get('lat') if data.get('lat') is not None else data.get('latitude')
        lng = data.get('lng') if data.get('lng') is not None else data.get('longitude')
        notes = data.get('notes', '')

        if lat is None or lng is None:
            return Response({'error': 'lat and lng are required'}, status=status.HTTP_400_BAD_REQUEST)

        staff = _get_staff_from_request(request)
        booking = None

        if booking_id:
            try:
                booking = Booking.objects.select_related('assigned_staff', 'patient').get(pk=booking_id)
                if not staff and booking.assigned_staff:
                    staff = booking.assigned_staff
            except Booking.DoesNotExist:
                pass

        if not staff and data.get('staff'):
            try:
                staff = StaffMember.objects.get(pk=data.get('staff'))
            except StaffMember.DoesNotExist:
                pass

        if not staff:
            staff = StaffMember.objects.first()

        sos = SOSEvent.objects.create(
            booking=booking,
            staff=staff,
            latitude=lat,
            longitude=lng,
            status=SOSEvent.SOSStatus.ACTIVE,
            notes=notes,
        )

        _broadcast_to_channel_layer({
            'type': 'broadcast_sos',
            'sos_id': sos.id,
            'booking_id': booking.id if booking else None,
            'staff_id': staff.id if staff else None,
            'staff_name': staff.full_name if staff else 'Field Staff',
            'patient_name': booking.patient.full_name if (booking and booking.patient) else 'Patient',
            'lat': float(lat),
            'lng': float(lng),
        })

        return Response(SOSEventSerializer(sos).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        sos = self.get_object()
        sos.status = 'resolved'
        sos.resolved_at = timezone.now()
        if request.user and request.user.is_authenticated:
            sos.resolved_by = request.user
        sos.notes = request.data.get('notes', sos.notes or '')
        sos.save(update_fields=['status', 'resolved_at', 'resolved_by', 'notes'])

        _broadcast_to_channel_layer({
            'type': 'broadcast_sos_resolve',
            'sos_id': sos.id,
            'status': 'resolved',
        })
        return Response(SOSEventSerializer(sos).data)

    @action(detail=False, methods=['get'])
    def active(self, request):
        qs = self.get_queryset().filter(status='active')
        return Response(SOSEventSerializer(qs, many=True).data)


class AlertRuleViewSet(viewsets.ModelViewSet):
    queryset = AlertRule.objects.all()
    serializer_class = AlertRuleSerializer

    def create(self, request, *args, **kwargs):
        rule = AlertRule.objects.first()
        if rule:
            serializer = self.get_serializer(rule, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=['get', 'post', 'patch'])
    def current(self, request):
        rule = AlertRule.objects.first()
        if not rule:
            rule = AlertRule.objects.create(name='Default Rules')
        if request.method in ['POST', 'PATCH']:
            serializer = AlertRuleSerializer(rule, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        return Response(AlertRuleSerializer(rule).data)


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
    if not request.user or not request.user.is_authenticated:
        return None
    try:
        return StaffMember.objects.get(user=request.user)
    except StaffMember.DoesNotExist:
        return None


# ── 1. GPS PING ───────────────────────────────────────────────────────────────

class GPSPingView(APIView):
    """
    POST /api/tracking/gps-ping/
    Body: {"booking_id": <int>, "lat": <float>, "lng": <float>}
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
            # Fallback to staff assigned to booking if superadmin/test user
            try:
                booking_lookup = Booking.objects.get(pk=booking_id)
                staff = booking_lookup.assigned_staff
            except Booking.DoesNotExist:
                pass

        if staff is None:
            return Response({'error': 'No StaffMember profile found for this account.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            booking = Booking.objects.select_related('patient').get(pk=booking_id)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

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

        # Broadcast live position to Web Dashboard
        _broadcast_to_channel_layer({
            'type': 'broadcast_location',
            'staff_id': staff.id,
            'lat': float(lat),
            'lng': float(lng),
            'eta_minutes': live_visit.eta_minutes,
        })

        # Persist this ping so the route trail endpoint has history
        LocationPing.objects.create(
            staff=staff,
            booking=booking,
            latitude=lat,
            longitude=lng,
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
                gevent = GeofenceEvent.objects.create(
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

                # Broadcast geofence check_in to all clients
                _broadcast_to_channel_layer({
                    'type': 'broadcast_geofence',
                    'event_id': gevent.id,
                    'booking_id': booking.id,
                    'event_type': 'check_in',
                    'lat': float(lat),
                    'lng': float(lng),
                    'timestamp': now.isoformat(),
                })

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
            try:
                booking_lookup = Booking.objects.get(pk=booking_id)
                staff = booking_lookup.assigned_staff
            except Booking.DoesNotExist:
                pass

        if staff is None:
            return Response({'error': 'No StaffMember profile found.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            booking = Booking.objects.get(pk=booking_id)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

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

        # Broadcast to channel layer
        _broadcast_to_channel_layer({
            'type': 'broadcast_geofence',
            'event_id': event.id,
            'booking_id': booking.id,
            'event_type': 'check_in',
            'lat': float(lat),
            'lng': float(lng),
            'timestamp': now.isoformat(),
        })

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
            try:
                booking_lookup = Booking.objects.get(pk=booking_id)
                staff = booking_lookup.assigned_staff
            except Booking.DoesNotExist:
                pass

        if staff is None:
            return Response({'error': 'No StaffMember profile found.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            booking = Booking.objects.get(pk=booking_id)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

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

        # Auto-generate billing invoice for the completed booking
        try:
            from billing.services import generate_invoice_for_booking
            generate_invoice_for_booking(booking)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not auto-generate invoice for booking {booking.id}: {e}")

        # Remove LiveVisit snapshot — visit is over
        LiveVisit.objects.filter(booking=booking).delete()

        # Update staff status back to available
        staff.status = 'available'
        staff.save(update_fields=['status'])

        # Broadcast to channel layer
        _broadcast_to_channel_layer({
            'type': 'broadcast_geofence',
            'event_id': event.id,
            'booking_id': booking.id,
            'event_type': 'check_out',
            'lat': float(lat),
            'lng': float(lng),
            'timestamp': now.isoformat(),
        })

        return Response({
            'event': GeofenceEventSerializer(event).data,
            'booking_status': booking.status,
            'visit_duration_minutes': visit_duration_minutes,
            'checked_out_at': now.isoformat(),
        }, status=status.HTTP_201_CREATED)


# ── 4. STAFF ROUTE HISTORY ────────────────────────────────────────────────────

class StaffRouteView(APIView):
    """
    GET /api/tracking/staff/<staff_id>/route/?limit=30

    Returns the most recent GPS pings for a given staff member, ordered
    oldest-first so the frontend Leaflet polyline is drawn in the correct
    travel direction.  Used to seed the route trail when the StaffProfilePanel
    first opens — thereafter the dashboard WebSocket keeps the trail live.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, staff_id):
        try:
            limit = max(1, min(int(request.query_params.get('limit', 30)), 200))
        except (TypeError, ValueError):
            limit = 30

        pings = (
            LocationPing.objects
            .filter(staff_id=staff_id)
            .order_by('-timestamp')[:limit]
        )

        # Reverse so oldest ping is first → correct polyline draw direction
        data = [
            {
                'lat': float(p.latitude),
                'lng': float(p.longitude),
                'ts':  p.timestamp.isoformat(),
            }
            for p in reversed(list(pings))
        ]

        return Response({'staff_id': staff_id, 'pings': data})
