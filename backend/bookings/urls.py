from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BookingViewSet

router = DefaultRouter()
router.register(r'', BookingViewSet, basename='booking')

urlpatterns = [
    path('public/', BookingViewSet.as_view({'post': 'public_booking'}), name='booking-public'),
    path('public-booking/', BookingViewSet.as_view({'post': 'public_booking'}), name='booking-public-alias'),
    path('', include(router.urls)),
]
