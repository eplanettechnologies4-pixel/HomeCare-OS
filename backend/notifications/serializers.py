from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'icon_key', 'message',
            'target_screen', 'target_params',
            'is_read', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']
