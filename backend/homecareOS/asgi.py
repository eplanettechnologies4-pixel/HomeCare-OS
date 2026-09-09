import os
import django
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

import tracking.routing
from homecareOS.jwt_middleware import JWTAuthMiddleware

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    # JWTAuthMiddleware supports:
    #   - Mobile app: ws://host/ws/tracking/?token=<JWT>
    #   - Web dashboard: ws://host/ws/tracking/ (falls back to session user)
    'websocket': JWTAuthMiddleware(
        URLRouter(tracking.routing.websocket_urlpatterns)
    ),
})

