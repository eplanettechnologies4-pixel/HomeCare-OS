from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StaffViewSet, LeaveRequestViewSet, AttendanceViewSet

router = DefaultRouter()
router.register(r'members', StaffViewSet, basename='staff-member')
router.register(r'leave-requests', LeaveRequestViewSet, basename='leave-request')
router.register(r'attendance', AttendanceViewSet, basename='attendance')

urlpatterns = [path('', include(router.urls))]
