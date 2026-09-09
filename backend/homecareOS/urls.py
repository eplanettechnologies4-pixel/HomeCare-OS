"""
HomeCare OS URL Configuration
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

# Extended auth views (me, forgot-password, verify-otp, reset-password)
from homecareOS.auth_views import (
    MeView,
    ForgotPasswordView,
    VerifyOTPView,
    ResetPasswordView,
)

urlpatterns = [
    path('django-admin/', admin.site.urls),

    # ── Auth ──────────────────────────────────────────────────────────────────
    # simplejwt standard endpoints
    path('api/auth/login/',   TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(),   name='token_refresh'),
    # Mobile: who-am-I + platform_allowed gate
    path('api/auth/me/',      MeView.as_view(),              name='auth-me'),
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

    # ── API Schema ────────────────────────────────────────────────────────────
    path('api/schema/', SpectacularAPIView.as_view(),                       name='schema'),
    path('api/docs/',   SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

