import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


class TrackingConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for live GPS tracking.

    Access Control:
      - Staff and Admins:
          * Join global 'tracking' group.
          * May send 'location_update', 'geofence_event', 'sos'.
          * Receive updates for all active field staff.
      - Family / Patient Portal Users:
          * Forbidden from global 'tracking' group.
          * Read-only: cannot send location updates.
          * Subscribed strictly to 'patient_{id}' for their own linked patient.
          * Only receive updates for their own patient's booking.
      - Unauthenticated: rejected with close code 4003.
    """

    TRACKING_GROUP = 'tracking'

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4003)
            return

        role_info = await self._get_user_role_info(user)
        self.is_staff_or_admin = role_info['is_staff_or_admin']
        self.is_family = role_info['is_family']
        self.patient_id = role_info['patient_id']

        if self.is_staff_or_admin:
            # Staff & admin join the global tracking group
            await self.channel_layer.group_add(self.TRACKING_GROUP, self.channel_name)
            await self.accept()
        elif self.is_family:
            if not self.patient_id:
                # Family user with no linked patient cannot join
                await self.close(code=4003)
                return
            # Family users join strictly their patient-scoped group
            self.patient_group = f'patient_{self.patient_id}'
            await self.channel_layer.group_add(self.patient_group, self.channel_name)
            await self.accept()
        else:
            await self.close(code=4003)

    async def disconnect(self, code):
        if getattr(self, 'is_staff_or_admin', False):
            await self.channel_layer.group_discard(self.TRACKING_GROUP, self.channel_name)
        elif getattr(self, 'is_family', False) and getattr(self, 'patient_group', None):
            await self.channel_layer.group_discard(self.patient_group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            data = json.loads(text_data)
        except Exception:
            await self.send(text_data=json.dumps({'type': 'error', 'error': 'Invalid JSON'}))
            return

        # Restrict mutation / broadcast permissions
        if not getattr(self, 'is_staff_or_admin', False):
            await self.send(text_data=json.dumps({
                'type': 'error',
                'error': 'Permission denied: Family users cannot broadcast location updates.'
            }))
            return

        msg_type = data.get('type')
        if msg_type == 'location_update':
            await self.handle_location_update(data)
        elif msg_type == 'geofence_event':
            await self.handle_geofence_event(data)
        elif msg_type == 'sos':
            await self.handle_sos(data)

    async def handle_location_update(self, data):
        staff_id = data.get('staff_id')
        lat = data.get('lat')
        lng = data.get('lng')
        eta = data.get('eta_minutes')
        booking_id = data.get('booking_id')

        if staff_id and lat is not None and lng is not None:
            await self.update_staff_location(staff_id, lat, lng)

        booking_info = await self.resolve_active_booking_info(staff_id, booking_id)
        patient_id = booking_info.get('patient_id')
        resolved_booking_id = booking_info.get('booking_id')

        payload = {
            'type': 'broadcast_location',
            'staff_id': staff_id,
            'booking_id': resolved_booking_id,
            'patient_id': patient_id,
            'lat': lat,
            'lng': lng,
            'eta_minutes': eta,
        }

        # 1. Broadcast to global admin/staff tracking group
        await self.channel_layer.group_send(self.TRACKING_GROUP, payload)

        # 2. Broadcast to specific patient group so family user receives it
        if patient_id:
            await self.channel_layer.group_send(f'patient_{patient_id}', payload)

    async def handle_geofence_event(self, data):
        event_info = await self.create_geofence_event(data)
        payload = {
            'type': 'broadcast_geofence',
            'event_id': event_info['id'],
            'booking_id': data.get('booking_id'),
            'patient_id': event_info['patient_id'],
            'event_type': data.get('event_type'),
            'lat': data.get('lat'),
            'lng': data.get('lng'),
            'timestamp': event_info['timestamp'],
        }
        await self.channel_layer.group_send(self.TRACKING_GROUP, payload)
        if event_info.get('patient_id'):
            await self.channel_layer.group_send(f"patient_{event_info['patient_id']}", payload)

    async def handle_sos(self, data):
        sos_info = await self.create_sos_event(data)
        payload = {
            'type': 'broadcast_sos',
            'sos_id': sos_info['id'],
            'booking_id': data.get('booking_id'),
            'staff_id': data.get('staff_id'),
            'patient_id': sos_info.get('patient_id'),
            'lat': data.get('lat'),
            'lng': data.get('lng'),
        }
        await self.channel_layer.group_send(self.TRACKING_GROUP, payload)
        if sos_info.get('patient_id'):
            await self.channel_layer.group_send(f"patient_{sos_info['patient_id']}", payload)

    # ── Channel layer message handlers ─────────────────────────────────────

    async def broadcast_location(self, event):
        payload = {k: v for k, v in event.items() if k != 'type'}
        payload['type'] = 'location_update'
        await self.send(text_data=json.dumps(payload))

    async def broadcast_geofence(self, event):
        payload = {k: v for k, v in event.items() if k != 'type'}
        payload['type'] = 'geofence_event'
        await self.send(text_data=json.dumps(payload))

    async def broadcast_sos(self, event):
        payload = {k: v for k, v in event.items() if k != 'type'}
        payload['type'] = 'sos'
        await self.send(text_data=json.dumps(payload))

    async def broadcast_sos_resolve(self, event):
        payload = {k: v for k, v in event.items() if k != 'type'}
        payload['type'] = 'sos_resolved'
        await self.send(text_data=json.dumps(payload))

    # ── DB helpers ──────────────────────────────────────────────────────────

    @database_sync_to_async
    def _get_user_role_info(self, user):
        from homecareOS.permissions import get_user_role, is_family_user
        if not user or not user.is_authenticated:
            return {'is_staff_or_admin': False, 'is_family': False, 'patient_id': None}

        if user.is_superuser or user.is_staff or hasattr(user, 'staffmember'):
            return {'is_staff_or_admin': True, 'is_family': False, 'patient_id': None}

        role = get_user_role(user)
        if role in ('super_admin', 'admin', 'branch_manager', 'care_manager', 'nurse', 'doctor', 'accountant', 'crm_executive'):
            return {'is_staff_or_admin': True, 'is_family': False, 'patient_id': None}

        if is_family_user(user):
            patient = getattr(user, 'patient_profile', None)
            return {
                'is_staff_or_admin': False,
                'is_family': True,
                'patient_id': patient.id if patient else None,
            }

        return {'is_staff_or_admin': False, 'is_family': False, 'patient_id': None}

    @database_sync_to_async
    def resolve_active_booking_info(self, staff_id, booking_id=None):
        from bookings.models import Booking
        if booking_id:
            b = Booking.objects.filter(pk=booking_id).values('id', 'patient_id').first()
            if b:
                return {'booking_id': b['id'], 'patient_id': b['patient_id']}
        if staff_id:
            b = Booking.objects.filter(
                assigned_staff_id=staff_id,
                status__in=['en_route', 'in_progress', 'assigned']
            ).order_by('-scheduled_time').values('id', 'patient_id').first()
            if b:
                return {'booking_id': b['id'], 'patient_id': b['patient_id']}
        return {'booking_id': None, 'patient_id': None}

    @database_sync_to_async
    def update_staff_location(self, staff_id, lat, lng):
        from staff.models import StaffMember
        from tracking.models import LiveVisit
        StaffMember.objects.filter(pk=staff_id).update(
            current_latitude=lat,
            current_longitude=lng,
        )
        LiveVisit.objects.filter(staff_id=staff_id).update(
            current_latitude=lat,
            current_longitude=lng,
        )

    @database_sync_to_async
    def create_geofence_event(self, data):
        from django.utils import timezone
        from .models import GeofenceEvent
        from bookings.models import Booking
        booking = Booking.objects.select_related('patient', 'assigned_staff').get(pk=data['booking_id'])
        staff = booking.assigned_staff
        event = GeofenceEvent.objects.create(
            booking=booking,
            staff=staff,
            event_type=data['event_type'],
            timestamp=timezone.now(),
            latitude=data['lat'],
            longitude=data['lng'],
        )
        return {
            'id': event.id,
            'timestamp': event.timestamp.isoformat(),
            'patient_id': booking.patient_id,
        }

    @database_sync_to_async
    def create_sos_event(self, data):
        from .models import SOSEvent
        from bookings.models import Booking
        kwargs = dict(latitude=data['lat'], longitude=data['lng'])
        patient_id = None
        if data.get('booking_id'):
            kwargs['booking_id'] = data['booking_id']
            booking = Booking.objects.select_related('assigned_staff').get(pk=data['booking_id'])
            kwargs['staff'] = booking.assigned_staff
            patient_id = booking.patient_id
        elif data.get('staff_id'):
            kwargs['staff_id'] = data['staff_id']
        sos = SOSEvent.objects.create(**kwargs)
        return {'id': sos.id, 'patient_id': patient_id}
