import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


class TrackingConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for live GPS tracking.
    
    Clients connect to ws://host/ws/tracking/ and subscribe to the
    'tracking' group to receive real-time location updates for all
    active field staff.

    Messages sent to the server:
      { "type": "location_update", "staff_id": 1, "lat": 24.86, "lng": 67.01, "eta_minutes": 8 }
      { "type": "geofence_event", "booking_id": 42, "event_type": "check_in", "lat": ..., "lng": ... }
      { "type": "sos", "booking_id": 42, "lat": ..., "lng": ... }
    """

    TRACKING_GROUP = 'tracking'

    async def connect(self):
        await self.channel_layer.group_add(self.TRACKING_GROUP, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.TRACKING_GROUP, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')

        if msg_type == 'location_update':
            await self.handle_location_update(data)
        elif msg_type == 'geofence_event':
            await self.handle_geofence_event(data)
        elif msg_type == 'sos':
            await self.handle_sos(data)

    async def handle_location_update(self, data):
        staff_id = data['staff_id']
        lat = data['lat']
        lng = data['lng']
        eta = data.get('eta_minutes')

        await self.update_staff_location(staff_id, lat, lng)

        # Broadcast to all connected admin clients
        await self.channel_layer.group_send(
            self.TRACKING_GROUP,
            {
                'type': 'broadcast_location',
                'staff_id': staff_id,
                'lat': lat,
                'lng': lng,
                'eta_minutes': eta,
            }
        )

    async def handle_geofence_event(self, data):
        event = await self.create_geofence_event(data)
        await self.channel_layer.group_send(
            self.TRACKING_GROUP,
            {
                'type': 'broadcast_geofence',
                'event_id': event.id,
                'booking_id': data['booking_id'],
                'event_type': data['event_type'],
                'lat': data['lat'],
                'lng': data['lng'],
                'timestamp': event.timestamp.isoformat(),
            }
        )

    async def handle_sos(self, data):
        sos = await self.create_sos_event(data)
        await self.channel_layer.group_send(
            self.TRACKING_GROUP,
            {
                'type': 'broadcast_sos',
                'sos_id': sos.id,
                'booking_id': data.get('booking_id'),
                'staff_id': data.get('staff_id'),
                'lat': data['lat'],
                'lng': data['lng'],
            }
        )

    # ── Channel layer message handlers ─────────────────────────────────────

    async def broadcast_location(self, event):
        await self.send(text_data=json.dumps({'type': 'location_update', **event}))

    async def broadcast_geofence(self, event):
        await self.send(text_data=json.dumps({'type': 'geofence_event', **event}))

    async def broadcast_sos(self, event):
        await self.send(text_data=json.dumps({'type': 'sos', **event}))

    async def broadcast_sos_resolve(self, event):
        await self.send(text_data=json.dumps({'type': 'sos_resolved', **event}))

    # ── DB helpers ──────────────────────────────────────────────────────────

    @database_sync_to_async
    def update_staff_location(self, staff_id, lat, lng):
        from django.utils import timezone
        from staff.models import StaffMember
        StaffMember.objects.filter(pk=staff_id).update(
            current_latitude=lat,
            current_longitude=lng,
            location_updated_at=timezone.now(),
        )

    @database_sync_to_async
    def create_geofence_event(self, data):
        from django.utils import timezone
        from .models import GeofenceEvent
        from bookings.models import Booking
        from staff.models import StaffMember
        booking = Booking.objects.get(pk=data['booking_id'])
        staff = booking.assigned_staff
        return GeofenceEvent.objects.create(
            booking=booking,
            staff=staff,
            event_type=data['event_type'],
            timestamp=timezone.now(),
            latitude=data['lat'],
            longitude=data['lng'],
        )

    @database_sync_to_async
    def create_sos_event(self, data):
        from .models import SOSEvent
        from bookings.models import Booking
        from staff.models import StaffMember
        kwargs = dict(latitude=data['lat'], longitude=data['lng'])
        if data.get('booking_id'):
            kwargs['booking_id'] = data['booking_id']
            booking = Booking.objects.get(pk=data['booking_id'])
            kwargs['staff'] = booking.assigned_staff
        elif data.get('staff_id'):
            kwargs['staff_id'] = data['staff_id']
        return SOSEvent.objects.create(**kwargs)
