"""
HomeCare OS URL Configuration
"""
from django.contrib import admin
from django.urls import path, re_path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from homecareOS.health_view import HealthCheckView
from reports.views import ReportsOverviewView

# Extended auth views (me, forgot-password, verify-otp, reset-password, custom login)
from homecareOS.auth_views import (
    CustomTokenObtainPairView,
    MeView,
    ForgotPasswordView,
    VerifyOTPView,
    ResetPasswordView,
    StaffActivateView,
)
from homecareOS.location_resolver import ResolveLocationLinkView
from lms.views import CertificateVerifyView
from lms.media_views import ProtectedLMSMediaView
from documents.media_views import ProtectedDocumentMediaView, ProtectedIdCardMediaView
from documents.signed_media import ProtectedClinicalMediaView
from patients.views import PrescriptionViewSet

urlpatterns = [
    path('django-admin/', admin.site.urls),

    # ── Prescriptions Global Route Alias ──────────────────────────────────────
    path('api/prescriptions/', PrescriptionViewSet.as_view({'get': 'list', 'post': 'create'}), name='prescription-root-list'),
    path('api/prescriptions/<int:pk>/', PrescriptionViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'}), name='prescription-root-detail'),

    # ── Auth ──────────────────────────────────────────────────────────────────
    # simplejwt login with username/email & rich user payload
    path('api/auth/login/',   CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(),          name='token_refresh'),
    # Mobile: who-am-I + platform_allowed gate
    path('api/auth/me/',      MeView.as_view(),              name='auth-me'),
    # Staff First-Time Account Activation
    path('api/auth/activate-staff/', StaffActivateView.as_view(),   name='auth-activate-staff'),
    # Forgot-password OTP flow (3 steps)
    path('api/auth/forgot-password/', ForgotPasswordView.as_view(), name='auth-forgot-password'),
    path('api/auth/verify-otp/',      VerifyOTPView.as_view(),      name='auth-verify-otp'),
    path('api/auth/reset-password/',  ResetPasswordView.as_view(),  name='auth-reset-password'),

    # ── App APIs ──────────────────────────────────────────────────────────────
    path('api/bookings/',      include('bookings.urls')),
    path('api/staff/',         include('staff.urls')),
    path('api/patients/',      include('patients.urls')),
    path('api/tracking/',      include('tracking.urls')),
    path('api/accounts/',      include('accounts.urls')),
    path('api/billing/',       include('billing.urls')),
    path('api/crm/',           include('crm.urls')),
    path('api/portal/',        include('portal.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/lms/',           include('lms.urls')),
    path('api/learning/',      include('lms.learning_urls')),
    path('api/documents/',     include('documents.urls')),
    path('api/forms/',         include('forms_builder.urls')),
    path('api/pharmacy/',      include('pharmacy.urls')),
    path('api/equipment/',     include('equipment.urls')),
    path('api/lab/',           include('lab.urls')),
    path('api/services/',      include('bookings.service_urls')),
    # Quality forms (manager-sign standalone endpoint)
    path('api/feedback/',      include('quality.urls')),
    path('api/staff-portal/',  include('staff_portal.urls')),

    path('api/health/', HealthCheckView.as_view(), name='health-check'),
    path('api/reports/overview/', ReportsOverviewView.as_view(), name='reports-overview'),

    # ── Location Link & Coordinate Resolver ───────────────────────────────────
    path('api/locations/resolve-link/', ResolveLocationLinkView.as_view(), name='locations-resolve-link'),

    # ── Public Real-Time Certificate Verification ─────────────────────────────
    path('api/certificates/verify/<str:certificate_id>/', CertificateVerifyView.as_view(), name='public-cert-verify'),

    # ── API Schema ────────────────────────────────────────────────────────────
    path('api/schema/', SpectacularAPIView.as_view(),                       name='schema'),
    path('api/docs/',   SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    # ── Protected Media Routes ────────────────────────────────────────────────
    path('media/lms/<path:filepath>', ProtectedLMSMediaView.as_view(), name='protected-lms-media'),
    path('media/documents/<path:filepath>', ProtectedDocumentMediaView.as_view(), name='protected-document-media'),
    path('media/staff_id_cards/<path:filepath>', ProtectedIdCardMediaView.as_view(subdir='staff_id_cards'), name='protected-staff-id-card-media'),
    path('media/id_cards/<path:filepath>', ProtectedIdCardMediaView.as_view(subdir='id_cards'), name='protected-id-card-media'),
    path('media/prescriptions/<path:filepath>', ProtectedClinicalMediaView.as_view(prefix='prescriptions'), name='protected-prescriptions-media'),
    path('media/labs/<path:filepath>', ProtectedClinicalMediaView.as_view(prefix='labs'), name='protected-labs-media'),
    path('media/lab_reports/<path:filepath>', ProtectedClinicalMediaView.as_view(prefix='lab_reports'), name='protected-lab-reports-media'),
    path('media/report_photos/<path:filepath>', ProtectedClinicalMediaView.as_view(prefix='report_photos'), name='protected-report-photos-media'),
    path('media/patient_photos/<path:filepath>', ProtectedClinicalMediaView.as_view(prefix='patient_photos'), name='protected-patient-photos-media'),
    path('media/certifications/<path:filepath>', ProtectedClinicalMediaView.as_view(prefix='certifications'), name='protected-certifications-media'),

    # ── Media Serving Fallback (Serves user uploads in production behind ASGI) ──
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

