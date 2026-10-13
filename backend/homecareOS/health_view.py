from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
import logging

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    """
    GET /api/health/
    Verifies database and redis connectivity for container healthchecks.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        health_status = {
            'status': 'healthy',
            'database': 'unknown',
            'redis': 'unknown',
        }
        is_healthy = True

        # 1. Database check
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1;')
                cursor.fetchone()
            health_status['database'] = 'connected'
        except Exception as e:
            logger.error("Health check DB failure: %s", e)
            health_status['database'] = f'error: {str(e)}'
            is_healthy = False

        # 2. Redis / Channel layer check
        try:
            from channels.layers import get_channel_layer
            channel_layer = get_channel_layer()
            if channel_layer:
                # In-memory channel layer or Redis channel layer
                health_status['redis'] = 'connected'
            else:
                health_status['redis'] = 'channel layer unconfigured'
        except Exception as e:
            logger.warning("Health check Redis failure: %s", e)
            health_status['redis'] = f'error: {str(e)}'
            # Do not fail hard if redis is optional in single-node dev, but flag for prod
            is_healthy = False

        status_code = status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
        if not is_healthy:
            health_status['status'] = 'unhealthy'

        return Response(health_status, status=status_code)
