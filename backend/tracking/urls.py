from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    GeofenceEventViewSet, SOSEventViewSet, AlertRuleViewSet, LiveVisitViewSet,
    GPSPingView, CheckInView, CheckOutView,
)

router = DefaultRouter()
router.register(r'geofence-events', GeofenceEventViewSet, basename='geofence-event')
router.register(r'sos', SOSEventViewSet, basename='sos-event')
router.register(r'alert-rules', AlertRuleViewSet, basename='alert-rule')
router.register(r'live-visits', LiveVisitViewSet, basename='live-visit')

urlpatterns = [
    path('', include(router.urls)),
    # Mobile write endpoints
    path('gps-ping/',  GPSPingView.as_view(),  name='tracking-gps-ping'),
    path('check-in/',  CheckInView.as_view(),  name='tracking-check-in'),
    path('check-out/', CheckOutView.as_view(), name='tracking-check-out'),
]
