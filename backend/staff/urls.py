from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StaffViewSet, LeaveRequestViewSet, AttendanceViewSet
from quality.views import StaffFeedbackView, StaffManagerChecklistView
from staff_portal.views import PublicStaffVerifyView
from .roster_views import (
    ShiftTemplateListCreateView, ShiftTemplateDetailView,
    RosterGridView, RosterAssignCellView, RosterBulkActionView,
    RosterPublishWeekView, RosterHistoryView,
    ShiftChangeRequestView, ShiftChangeRequestApprovalView,
    ScheduleDutyView
)
from .lifecycle_views import (
    StaffOnboardingSummaryView, StaffRegenerateCodeView,
    StaffStageAdvanceView, StaffStageReturnView,
    StaffRequirementUploadView, StaffRequirementVerifyView,
    StaffRequirementRejectView, StaffRequirementWaiveView,
    StaffRequirementAssessmentView, StaffRequirementFeedbackView,
    StaffDocumentDownloadView,
)
from .pin_views import (
    DutyPINListView,
    DutyPINRevealView,
    DutyPINRegenerateView,
    DutyPINRevokeView,
    StaffAccessLogView,
)

router = DefaultRouter()
router.register(r'members', StaffViewSet, basename='staff-member')
router.register(r'leave-requests', LeaveRequestViewSet, basename='leave-request')
router.register(r'attendance', AttendanceViewSet, basename='attendance')

urlpatterns = [
    # Staff Lifecycle, Onboarding & Document Verification
    path('requirements/<int:pk>/upload/', StaffRequirementUploadView.as_view(), name='staff-requirement-upload'),
    path('requirements/<int:pk>/verify/', StaffRequirementVerifyView.as_view(), name='staff-requirement-verify'),
    path('requirements/<int:pk>/reject/', StaffRequirementRejectView.as_view(), name='staff-requirement-reject'),
    path('requirements/<int:pk>/waive/', StaffRequirementWaiveView.as_view(), name='staff-requirement-waive'),
    path('requirements/<int:pk>/record-assessment/', StaffRequirementAssessmentView.as_view(), name='staff-requirement-assessment'),
    path('requirements/<int:pk>/add-feedback/', StaffRequirementFeedbackView.as_view(), name='staff-requirement-feedback'),
    path('documents/<int:pk>/download/', StaffDocumentDownloadView.as_view(), name='staff-document-download'),

    # Direct Staff Stage & Onboarding Route Aliases (api/staff/<id>/...)
    path('<int:pk>/onboarding/', StaffOnboardingSummaryView.as_view(), name='staff-onboarding-alias'),
    path('<int:pk>/regenerate-code/', StaffRegenerateCodeView.as_view(), name='staff-regenerate-code-alias'),
    path('<int:pk>/stage/advance/', StaffStageAdvanceView.as_view(), name='staff-stage-advance-alias'),
    path('<int:pk>/stage/return/', StaffStageReturnView.as_view(), name='staff-stage-return-alias'),

    # Roster Management & Scheduling
    path('shift-templates/', ShiftTemplateListCreateView.as_view(), name='shift-template-list'),
    path('shift-templates/<int:pk>/', ShiftTemplateDetailView.as_view(), name='shift-template-detail'),
    path('shift-templates/<int:pk>/deactivate/', ShiftTemplateDetailView.as_view(), name='shift-template-deactivate'),
    path('roster/', RosterGridView.as_view(), name='staff-roster-grid'),
    path('roster/assign/', RosterAssignCellView.as_view(), name='staff-roster-assign'),
    path('roster/bulk/', RosterBulkActionView.as_view(), name='staff-roster-bulk'),
    path('roster/publish/', RosterPublishWeekView.as_view(), name='staff-roster-publish'),
    path('roster/history/', RosterHistoryView.as_view(), name='staff-roster-history'),
    path('roster/schedule-duty/', ScheduleDutyView.as_view(), name='staff-roster-schedule-duty'),
    path('roster/shift-change-request/', ShiftChangeRequestView.as_view(), name='staff-shift-change-request'),
    path('roster/shift-change-request/<int:pk>/<str:action>/', ShiftChangeRequestApprovalView.as_view(), name='staff-shift-change-approval'),

    # Patient File Lock + Duty PIN (Admin / Super Admin)
    path('duty-pins/', DutyPINListView.as_view(), name='duty-pin-list'),
    path('duty-pins/<int:pk>/reveal/', DutyPINRevealView.as_view(), name='duty-pin-reveal'),
    path('duty-pins/<int:pk>/regenerate/', DutyPINRegenerateView.as_view(), name='duty-pin-regenerate'),
    path('duty-pins/<int:pk>/revoke/', DutyPINRevokeView.as_view(), name='duty-pin-revoke'),
    path('members/<int:pk>/access-log/', StaffAccessLogView.as_view(), name='staff-access-log'),

    path('verify/<str:token>/', PublicStaffVerifyView.as_view(), name='staff-public-verify'),
    path('', include(router.urls)),
    # Quality: feedback received by / checklists evaluating a staff member
    path('members/<int:staff_pk>/feedback/', StaffFeedbackView.as_view(), name='staff-feedback'),
    path('members/<int:staff_pk>/manager-checklist/', StaffManagerChecklistView.as_view(), name='staff-manager-checklist'),
]
