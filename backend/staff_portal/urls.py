from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    StaffPortalHomeView,
    StaffPortalRosterView,
    StaffPortalPatientsListView,
    StaffPortalPatientDetailView,
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
    path('roster/', StaffPortalRosterView.as_view(), name='staff-portal-roster'),
    path('patients/', StaffPortalPatientsListView.as_view(), name='staff-portal-patients-list'),
    path('patients/<int:pk>/', StaffPortalPatientDetailView.as_view(), name='staff-portal-patient-detail'),
    path('employee-card/', EmployeeCardView.as_view(), name='staff-portal-employee-card'),
    # LMS / Trainings for Field Staff & Nurses
    path('trainings/', StaffPortalTrainingsListView.as_view(), name='staff-portal-trainings-list'),
    path('trainings/<int:course_id>/', StaffPortalTrainingDetailView.as_view(), name='staff-portal-training-detail'),
    path('trainings/<int:course_id>/lectures/<int:lecture_id>/progress/', StaffPortalLectureProgressView.as_view(), name='staff-portal-lecture-progress'),
    path('certificates/', StaffPortalCertificatesListView.as_view(), name='staff-portal-certificates-list'),
    path('certificates/<int:pk>/download/', StaffPortalCertificateDownloadView.as_view(), name='staff-portal-certificate-download'),
    path('', include(router.urls)),
]
