import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)


class EventsConsumer(AsyncWebsocketConsumer):
    """
    Authenticated real-time events consumer.
    Endpoint: ws://<host>/ws/events/?token=<JWT>

    On connect:
      Automatically joins groups based on the user's role and relations:
        - user_<id>
        - patient_<id> (for linked family/patient accounts)
        - staff_<id>   (for staff accounts)
        - role_admin   (for admins, managers, accountants, superusers)

    Events are JSON payloads:
      {"type": "invoice.created", "data": {...}}
      {"type": "invoice.updated", "data": {...}}
      {"type": "invoice.paid", "data": {...}}
      {"type": "form.submitted", "data": {...}}
      {"type": "course.assigned", "data": {...}}
      {"type": "lecture.ready", "data": {...}}
    """

    async def connect(self):
        user = self.scope.get('user')
        if not user or user.is_anonymous:
            logger.warning("[EventsWS] Rejecting unauthenticated WebSocket connection.")
            await self.close(code=4001)
            return

        self.user = user
        self.groups_joined = []

        # Resolve role & relations
        groups = await self._resolve_user_groups(user)
        self.groups_joined = groups

        # Join all authorized Channel Layer groups
        for group in groups:
            await self.channel_layer.group_add(group, self.channel_name)

        await self.accept()
        logger.info(f"[EventsWS] User {user.username} (ID: {user.id}) connected. Groups: {groups}")

        # Send greeting / ack with joined groups
        await self.send(text_data=json.dumps({
            'type': 'connection.established',
            'data': {
                'user_id': user.id,
                'username': user.username,
                'groups': groups,
            }
        }))

    async def disconnect(self, code):
        for group in getattr(self, 'groups_joined', []):
            try:
                await self.channel_layer.group_discard(group, self.channel_name)
            except Exception:
                pass
        logger.info(f"[EventsWS] User {getattr(self.user, 'username', 'anon')} disconnected (code: {code})")

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            payload = json.loads(text_data)
            action = payload.get('action') or payload.get('type')
            if action == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong', 'timestamp': payload.get('timestamp')}))
        except Exception as e:
            logger.debug(f"[EventsWS] Parse error on receive: {e}")

    # ── Channel Layer Event Handlers ──────────────────────────────────────────

    async def events_broadcast(self, event):
        """Generic broadcaster method for events sent to channel groups."""
        event_type = event.get('event_type') or event.get('type')
        data = event.get('data', {})
        await self.send(text_data=json.dumps({
            'type': event_type,
            'data': data,
        }))

    async def invoice_created(self, event):
        await self.events_broadcast(event)

    async def invoice_updated(self, event):
        await self.events_broadcast(event)

    async def invoice_paid(self, event):
        await self.events_broadcast(event)

    async def form_submitted(self, event):
        await self.events_broadcast(event)

    async def course_assigned(self, event):
        await self.events_broadcast(event)

    async def lecture_ready(self, event):
        await self.events_broadcast(event)

    # ── DB Helpers ────────────────────────────────────────────────────────────

    @database_sync_to_async
    def _resolve_user_groups(self, user):
        groups = [f"user_{user.id}"]

        # 1. Staff group
        staff = getattr(user, 'staffmember', None)
        if staff:
            groups.append(f"staff_{staff.id}")

        # 2. Patient / Family group
        patient = getattr(user, 'patient_profile', None)
        if patient:
            groups.append(f"patient_{patient.id}")

        # Check linked patient via Patient model query if not OneToOne direct
        if not patient:
            from patients.models import Patient
            linked = Patient.objects.filter(portal_user=user).first()
            if linked:
                groups.append(f"patient_{linked.id}")

        # 3. Admin / Manager / Accountant group
        is_admin = user.is_staff or user.is_superuser
        if not is_admin:
            profile = getattr(user, 'profile', None)
            role = getattr(profile, 'role', '') if profile else ''
            if role in ['admin', 'branch_manager', 'care_manager', 'accountant']:
                is_admin = True
            elif staff and staff.role in ['admin', 'branch_manager', 'care_manager', 'accountant']:
                is_admin = True

        if is_admin:
            groups.append("role_admin")

        return list(dict.fromkeys(groups))
