from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StaffViewSet, LeaveRequestViewSet, AttendanceViewSet
from quality.views import StaffFeedbackView, StaffManagerChecklistView
from staff_portal.views import PublicStaffVerifyView

router = DefaultRouter()
router.register(r'members', StaffViewSet, basename='staff-member')
router.register(r'leave-requests', LeaveRequestViewSet, basename='leave-request')
router.register(r'attendance', AttendanceViewSet, basename='attendance')

urlpatterns = [
    path('verify/<str:token>/', PublicStaffVerifyView.as_view(), name='staff-public-verify'),
    path('', include(router.urls)),
    # Quality: feedback received by / checklists evaluating a staff member
    path('members/<int:staff_pk>/feedback/', StaffFeedbackView.as_view(), name='staff-feedback'),
    path('members/<int:staff_pk>/manager-checklist/', StaffManagerChecklistView.as_view(), name='staff-manager-checklist'),
]
