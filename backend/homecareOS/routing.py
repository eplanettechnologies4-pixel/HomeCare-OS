from django.urls import re_path
import tracking.consumers
from homecareOS.events_consumer import EventsConsumer

websocket_urlpatterns = [
    re_path(r'^ws/events/?$', EventsConsumer.as_asgi()),
    re_path(r'^ws/tracking/?$', tracking.consumers.TrackingConsumer.as_asgi()),
]
