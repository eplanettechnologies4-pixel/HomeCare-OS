from django.urls import re_path
from . import consumers
from homecareOS.events_consumer import EventsConsumer

websocket_urlpatterns = [
    re_path(r'^ws/tracking/?$', consumers.TrackingConsumer.as_asgi()),
    re_path(r'^ws/events/?$',   EventsConsumer.as_asgi()),
]
