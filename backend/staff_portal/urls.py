from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    StaffPortalHomeView,
    ClinicianPortalHomeView,
    DoctorConsultationsListView,
    DoctorPendingRequestsListView,
    DoctorPatientsByTierListView,
    StaffPortalRosterView,
    StaffPortalPatientsListView,
    StaffPortalPatientDetailView,
    NurseTodayWorkListView,
    ShiftHandoverNoteListView,
    ShiftHandoverNoteDetailView,
    ShiftHandoverNoteMarkErrorView,
    StaffRequestViewSet,
    OvertimeClaimViewSet,
    ComplaintViewSet,
    ResignationViewSet,
    PermissionRequestViewSet,
    CompanyPolicyViewSet,
    EmployeeCardView,
    PublicStaffVerifyView,
    FamilyConcernViewSet,
    StaffPortalTrainingsListView,
    StaffPortalTrainingDetailView,
    StaffPortalLectureProgressView,
    StaffPortalCertificatesListView,
    StaffPortalCertificateDownloadView,
)
from .visit_views import (
    NurseVisitStartView,
    NurseVisitEndView,
    NurseVisitActiveView,
    NurseVisitLogView,
)

router = DefaultRouter()
router.register(r'requests', StaffRequestViewSet, basename='staff-portal-requests')
router.register(r'overtime-claims', OvertimeClaimViewSet, basename='staff-portal-overtime')
router.register(r'complaints', ComplaintViewSet, basename='staff-portal-complaints')
router.register(r'resignation', ResignationViewSet, basename='staff-portal-resignation')
router.register(r'permission-requests', PermissionRequestViewSet, basename='staff-portal-permissions')
router.register(r'policies', CompanyPolicyViewSet, basename='staff-portal-policies')
router.register(r'family-concerns', FamilyConcernViewSet, basename='staff-portal-family-concerns')

urlpatterns = [
    path('home/', StaffPortalHomeView.as_view(), name='staff-portal-home'),
    path('clinician-home/', ClinicianPortalHomeView.as_view(), name='staff-portal-clinician-home'),
    path('consultations-list/', DoctorConsultationsListView.as_view(), name='staff-portal-consultations-list'),
    path('pending-requests-list/', DoctorPendingRequestsListView.as_view(), name='staff-portal-pending-requests-list'),
    path('patients-by-tier/', DoctorPatientsByTierListView.as_view(), name='staff-portal-patients-by-tier'),
    path('roster/', StaffPortalRosterView.as_view(), name='staff-portal-roster'),
    path('patients/', StaffPortalPatientsListView.as_view(), name='staff-portal-patients-list'),
    path('patients/<int:pk>/', StaffPortalPatientDetailView.as_view(), name='staff-portal-patient-detail'),
    path('nurse-work-list/', NurseTodayWorkListView.as_view(), name='staff-portal-nurse-work-list'),
    path('handovers/', ShiftHandoverNoteListView.as_view(), name='staff-portal-handovers'),
    path('handovers/<int:pk>/', ShiftHandoverNoteDetailView.as_view(), name='staff-portal-handover-detail'),
    path('handovers/<int:pk>/mark-entered-in-error/', ShiftHandoverNoteMarkErrorView.as_view(), name='staff-portal-handover-mark-error'),
    path('employee-card/', EmployeeCardView.as_view(), name='staff-portal-employee-card'),
    # LMS / Trainings for Field Staff & Nurses
    path('trainings/', StaffPortalTrainingsListView.as_view(), name='staff-portal-trainings-list'),
    path('trainings/<int:course_id>/', StaffPortalTrainingDetailView.as_view(), name='staff-portal-training-detail'),
    path('trainings/<int:course_id>/lectures/<int:lecture_id>/progress/', StaffPortalLectureProgressView.as_view(), name='staff-portal-lecture-progress'),
    path('certificates/', StaffPortalCertificatesListView.as_view(), name='staff-portal-certificates-list'),
    path('certificates/<int:pk>/download/', StaffPortalCertificateDownloadView.as_view(), name='staff-portal-certificate-download'),
    # Nurse Visit Flow
    path('visit/start/', NurseVisitStartView.as_view(), name='staff-portal-visit-start'),
    path('visit/end/', NurseVisitEndView.as_view(), name='staff-portal-visit-end'),
    path('visit/active/', NurseVisitActiveView.as_view(), name='staff-portal-visit-active'),
    path('visit/log/', NurseVisitLogView.as_view(), name='staff-portal-visit-log'),
    path('', include(router.urls)),
]
