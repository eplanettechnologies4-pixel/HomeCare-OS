"""
JWT WebSocket Auth Middleware
=============================
Allows Django Channels WebSocket connections to authenticate using a JWT access
token passed as a query parameter:

    ws://host/ws/tracking/?token=<JWT_ACCESS_TOKEN>

This is required by the React Native mobile app because browsers/native clients
cannot set custom HTTP headers during the WebSocket handshake. The web dashboard
continues to work via Django's session-based AuthMiddlewareStack since it is
browser-based and already has a session cookie.

Falls back gracefully to AnonymousUser if no token is supplied or the token
is invalid/expired — letting unauthenticated connections through (the consumer
itself can reject them if authentication is required).

Usage in asgi.py:
    from homecareOS.jwt_middleware import JWTAuthMiddleware
    application = ProtocolTypeRouter({
        'http': get_asgi_application(),
        'websocket': JWTAuthMiddleware(
            URLRouter(tracking.routing.websocket_urlpatterns)
        ),
    })
"""
from urllib.parse import parse_qs

from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async


class JWTAuthMiddleware(BaseMiddleware):
    """
    ASGI middleware that resolves a ?token=<JWT> query parameter to a Django
    User and attaches it to the WebSocket scope before passing to the consumer.
    """

    async def __call__(self, scope, receive, send):
        from django.contrib.auth.models import AnonymousUser

        query_string = scope.get('query_string', b'').decode()
        params = parse_qs(query_string)
        token_list = params.get('token', [])

        if token_list:
            scope['user'] = await self._get_user_from_token(token_list[0])
        elif not scope.get('user'):
            # No session user and no token — anonymous
            scope['user'] = AnonymousUser()

        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def _get_user_from_token(self, raw_token: str):
        """
        Decode the simplejwt AccessToken and return the matching User.
        Returns AnonymousUser on any error (expired, invalid signature, etc.).
        """
        try:
            from rest_framework_simplejwt.tokens import AccessToken
            from django.contrib.auth.models import User

            decoded = AccessToken(raw_token)
            user_id = decoded['user_id']
            return User.objects.get(pk=user_id)

        except Exception:
            from django.contrib.auth.models import AnonymousUser
            return AnonymousUser()
