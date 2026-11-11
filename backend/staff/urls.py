from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StaffViewSet, LeaveRequestViewSet, AttendanceViewSet
from quality.views import StaffFeedbackView, StaffManagerChecklistView
from staff_portal.views import PublicStaffVerifyView
from .roster_views import (
    ShiftTemplateListCreateView, ShiftTemplateDetailView,
    RosterGridView, RosterAssignCellView, RosterBulkActionView,
    RosterPublishWeekView, RosterHistoryView,
    ShiftChangeRequestView, ShiftChangeRequestApprovalView
)

router = DefaultRouter()
router.register(r'members', StaffViewSet, basename='staff-member')
router.register(r'leave-requests', LeaveRequestViewSet, basename='leave-request')
router.register(r'attendance', AttendanceViewSet, basename='attendance')

urlpatterns = [
    # Roster Management & Scheduling
    path('shift-templates/', ShiftTemplateListCreateView.as_view(), name='shift-template-list'),
    path('shift-templates/<int:pk>/', ShiftTemplateDetailView.as_view(), name='shift-template-detail'),
    path('shift-templates/<int:pk>/deactivate/', ShiftTemplateDetailView.as_view(), name='shift-template-deactivate'),
    path('roster/', RosterGridView.as_view(), name='staff-roster-grid'),
    path('roster/assign/', RosterAssignCellView.as_view(), name='staff-roster-assign'),
    path('roster/bulk/', RosterBulkActionView.as_view(), name='staff-roster-bulk'),
    path('roster/publish/', RosterPublishWeekView.as_view(), name='staff-roster-publish'),
    path('roster/history/', RosterHistoryView.as_view(), name='staff-roster-history'),
    path('roster/shift-change-request/', ShiftChangeRequestView.as_view(), name='staff-shift-change-request'),
    path('roster/shift-change-request/<int:pk>/<str:action>/', ShiftChangeRequestApprovalView.as_view(), name='staff-shift-change-approval'),

    path('verify/<str:token>/', PublicStaffVerifyView.as_view(), name='staff-public-verify'),
    path('', include(router.urls)),
    # Quality: feedback received by / checklists evaluating a staff member
    path('members/<int:staff_pk>/feedback/', StaffFeedbackView.as_view(), name='staff-feedback'),
    path('members/<int:staff_pk>/manager-checklist/', StaffManagerChecklistView.as_view(), name='staff-manager-checklist'),
]
