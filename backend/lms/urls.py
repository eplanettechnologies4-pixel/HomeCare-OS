from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CourseViewSet, LectureViewSet, CourseAssignmentViewSet, CertificateViewSet,
    LectureProgressView, StaffTrainingView, StaffCertificatesView, CertificateVerifyView,
)

router = DefaultRouter()
router.register(r'courses',      CourseViewSet,          basename='lms-course')
router.register(r'lectures',     LectureViewSet,         basename='lms-lecture')
router.register(r'assignments',  CourseAssignmentViewSet, basename='lms-assignment')
router.register(r'certificates', CertificateViewSet,      basename='lms-certificate')

urlpatterns = [
    path('', include(router.urls)),
    # Watch-progress ping — mirrors GPS ping pattern
    path('lectures/<int:lecture_id>/progress/', LectureProgressView.as_view(), name='lms-progress'),
    # Per-staff training overview (for Staff Profile Training tab)
    path('staff/<int:staff_id>/training/', StaffTrainingView.as_view(), name='lms-staff-training'),
    # Per-staff certificates list (for Staff Profile Certificates tab)
    path('staff/<int:staff_id>/certificates/', StaffCertificatesView.as_view(), name='lms-staff-certificates'),
    # Public certificate verification (no auth) - supports both /verify/<id>/ and /verify/?id=...
    path('verify/<str:certificate_id>/', CertificateVerifyView.as_view(), name='lms-verify-id'),
    path('verify/', CertificateVerifyView.as_view(), name='lms-verify'),
]

