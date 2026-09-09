from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET  /api/notifications/           — list notifications for the logged-in user (most recent first)
    POST /api/notifications/{id}/read/ — mark a single notification as read
    POST /api/notifications/read-all/  — mark all unread notifications as read
    """
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Always scope to the authenticated user only — never leak other users' notifications."""
        return Notification.objects.filter(recipient=self.request.user)

    @action(detail=True, methods=['post'], url_path='read')
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=['post'], url_path='read-all')
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'marked_read': updated})

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({'unread': count})


# ── Helper function used by other apps to fire notifications ─────────────────

def create_notification(
    recipient_user,
    message: str,
    icon_key: str = 'bell',
    target_screen: str = '',
    target_params: dict | None = None,
) -> Notification:
    """
    Convenience function called by bookings, staff, and tasks to create a
    Notification record for a given Django auth User.
    If recipient_user is None (e.g. staff with no linked user), the call is a no-op.
    """
    if recipient_user is None:
        return None
    return Notification.objects.create(
        recipient=recipient_user,
        icon_key=icon_key,
        message=message,
        target_screen=target_screen,
        target_params=target_params or {},
    )
