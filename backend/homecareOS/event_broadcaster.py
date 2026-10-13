import logging
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


def broadcast_event(event_type: str, data: dict, groups: list):
    """
    Broadcast a real-time event payload to a list of Channel Layer groups.
    Payload formatted as: {"type": event_type, "data": data}
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning(f"[EventBroadcaster] No channel layer available to broadcast {event_type}")
        return

    payload = {
        'type': 'events_broadcast',
        'event_type': event_type,
        'data': data,
    }

    for group in groups:
        if not group:
            continue
        try:
            async_to_sync(channel_layer.group_send)(str(group), payload)
        except Exception as e:
            logger.warning(f"[EventBroadcaster] Failed to send {event_type} to group {group}: {e}")
