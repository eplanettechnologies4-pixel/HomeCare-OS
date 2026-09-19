"""
HomeCare OS — Extended Authentication Views
============================================
Adds to the JWT auth surface:

  GET  /api/auth/me/               — returns the authenticated user's profile
  POST /api/auth/forgot-password/  — generate & send a 6-digit OTP
  POST /api/auth/verify-otp/       — validate OTP, return a reset_token
  POST /api/auth/reset-password/   — set new password using reset_token

These are plain APIViews (not ViewSets) so they can be added directly
to the root urlpatterns next to simplejwt's token endpoints.
"""
import secrets
import logging

from django.contrib.auth.models import User
from django.utils import timezone

from rest_framework import status, serializers
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

logger = logging.getLogger(__name__)


# ── 0. LOGIN WITH USERNAME OR EMAIL ───────────────────────────────────────────

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Allows login via either username OR email.
    Attaches user profile and platform permissions directly to the JWT response.
    """
    def validate(self, attrs):
        login_input = attrs.get('username', '').strip()

        # If login_input looks like an email or wasn't found as a username, check email
        if login_input:
            if login_input.lower() in ('admin@homecareos.com', 'admin@ehealth.com'):
                user_by_email = User.objects.filter(username='admin').first()
            else:
                user_by_email = User.objects.filter(email__iexact=login_input).first()
            if user_by_email:
                attrs['username'] = user_by_email.username

        data = super().validate(attrs)

        user = self.user
        staff_member = getattr(user, 'staffmember', None)
        role = staff_member.role if staff_member else ('super_admin' if user.is_superuser else 'admin')
        platform_allowed = staff_member.platform_allowed if staff_member else 'web'

        req = self.context.get('request')
        client_platform = None
        if req:
            client_platform = req.data.get('platform') or req.headers.get('X-Client-Platform')

        if client_platform == 'web' and platform_allowed == 'mobile':
            raise serializers.ValidationError({
                'detail': 'This account is configured for mobile app access only. Please log in using the HomeCare OS Mobile App.',
                'code': 'mobile_only',
                'platform_allowed': 'mobile'
            })
        if client_platform == 'mobile' and platform_allowed == 'web':
            raise serializers.ValidationError({
                'detail': 'This account is configured for web access only. Please log in at the HomeCare OS web dashboard.',
                'code': 'web_only',
                'platform_allowed': 'web'
            })

        data['user'] = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'name': f'{user.first_name} {user.last_name}'.strip() or user.username,
            'full_name': f'{user.first_name} {user.last_name}'.strip() or user.username,
            'role': role,
            'role_display': staff_member.get_role_display() if staff_member else role.replace('_', ' ').title(),
            'platform_allowed': platform_allowed,
            'staff_id': staff_member.id if staff_member else None,
            'employee_id': staff_member.employee_id if staff_member else None,
        }

        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


# ── 1. WHO AM I ───────────────────────────────────────────────────────────────

class MeView(APIView):
    """
    GET /api/auth/me/

    Returns the authenticated user's own profile.  The mobile app calls this
    immediately after login to:
      1. Know the user's role so it can route to the correct navigator.
      2. Verify that this account is permitted to use the mobile platform.

    Roles that should NOT have mobile access:
      super_admin, admin, branch_manager, accountant, crm_executive

    These are enforced by `platform_allowed = 'web'` on their StaffMember record.
    The endpoint returns a 403 with a clear error message so the mobile app can
    show a friendly "This account is for web use only" screen instead of an empty UI.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        # Try to find the linked StaffMember (exists for all clinical/operational staff)
        staff_member = None
        try:
            staff_member = user.staffmember  # reverse OneToOne accessor
        except Exception:
            pass  # admin-only accounts may have no StaffMember

        # Build the response payload
        payload = {
            'id': user.id,
            'full_name': f'{user.first_name} {user.last_name}'.strip() or user.username,
            'email': user.email,
            'username': user.username,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
        }

        if staff_member:
            # Determine mobile access
            platform_allowed = staff_member.platform_allowed
            if platform_allowed == 'web':
                return Response(
                    {
                        'error': 'mobile_not_allowed',
                        'detail': (
                            'This account is configured for web access only. '
                            'Please log in at the HomeCare OS web dashboard.'
                        ),
                        'platform_allowed': platform_allowed,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            payload.update({
                'staff_id': staff_member.id,
                'staff_employee_id': staff_member.employee_id,
                'role': staff_member.role,
                'role_display': staff_member.get_role_display(),
                'specialization': staff_member.specialization,
                'phone': staff_member.phone,
                'photo': request.build_absolute_uri(staff_member.photo.url) if staff_member.photo else None,
                'branch': getattr(staff_member, 'branch', None),
                'platform_allowed': platform_allowed,
                'status': staff_member.status,
                'rating': float(staff_member.rating),
            })
        else:
            # Superuser / Django admin with no StaffMember profile
            payload['platform_allowed'] = 'web'

        return Response(payload)


# ── 2. FORGOT PASSWORD / OTP FLOW ─────────────────────────────────────────────

class ForgotPasswordView(APIView):
    """
    POST /api/auth/forgot-password/
    Body: {"identifier": "<email_or_phone>"}

    Looks up a User by email or (if no match) by phone via StaffMember.
    Generates a 6-digit OTP with a 10-minute expiry.

    In development (DEBUG=True) the OTP is printed to the console.
    In production wire up an SMS/email backend here.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from notifications.models import PasswordResetOTP
        from django.conf import settings

        identifier = request.data.get('identifier', '').strip()
        if not identifier:
            return Response({'error': 'identifier is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve identifier → User
        user = self._resolve_user(identifier)
        if user is None:
            # Return 200 even if no user found — prevents account enumeration
            return Response({'detail': 'If that account exists, an OTP has been sent.'})

        otp_record = PasswordResetOTP.generate(identifier=identifier)

        if settings.DEBUG:
            logger.warning(
                f'[DEV] Password reset OTP for {identifier}: {otp_record.otp_code}'
            )
            print(f'\n{"="*50}\nDEV OTP for {identifier}: {otp_record.otp_code}\n{"="*50}\n')
        else:
            # Production: plug in your SMS/email gateway here
            # e.g. send_sms(identifier, f'Your HomeCare OS OTP is: {otp_record.otp_code}')
            pass

        return Response({'detail': 'If that account exists, an OTP has been sent.'})

    @staticmethod
    def _resolve_user(identifier: str):
        """Resolve an email address or phone number to a Django User."""
        # 1. Try email
        try:
            return User.objects.get(email__iexact=identifier)
        except User.DoesNotExist:
            pass

        # 2. Try phone via StaffMember
        from staff.models import StaffMember
        try:
            staff = StaffMember.objects.select_related('user').get(phone=identifier)
            return staff.user
        except StaffMember.DoesNotExist:
            pass

        return None


class VerifyOTPView(APIView):
    """
    POST /api/auth/verify-otp/
    Body: {"identifier": "...", "otp": "123456"}

    Validates the OTP. If correct and not expired, returns a short-lived
    reset_token that is required by the ResetPasswordView.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from notifications.models import PasswordResetOTP

        identifier = request.data.get('identifier', '').strip()
        otp_code   = request.data.get('otp', '').strip()

        if not identifier or not otp_code:
            return Response(
                {'error': 'identifier and otp are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        record = PasswordResetOTP.objects.filter(
            identifier=identifier,
            otp_code=otp_code,
            is_used=False,
        ).first()

        if record is None:
            return Response({'error': 'Invalid OTP.'}, status=status.HTTP_400_BAD_REQUEST)

        if record.is_expired:
            return Response(
                {'error': 'OTP has expired. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Issue a reset token and mark this OTP as consumed
        reset_token = secrets.token_urlsafe(48)
        record.reset_token = reset_token
        record.is_used = True
        record.save(update_fields=['reset_token', 'is_used'])

        return Response({'reset_token': reset_token})


class ResetPasswordView(APIView):
    """
    POST /api/auth/reset-password/
    Body: {"reset_token": "...", "new_password": "..."}

    Sets the user's new password. Validates:
      - reset_token exists and was issued within the last 10 minutes
      - new_password meets minimum length (min 8 chars)
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from notifications.models import PasswordResetOTP

        reset_token  = request.data.get('reset_token', '').strip()
        new_password = request.data.get('new_password', '').strip()

        if not reset_token or not new_password:
            return Response(
                {'error': 'reset_token and new_password are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(new_password) < 8:
            return Response(
                {'error': 'Password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # The reset_token is only set on records that have already been marked used
        # (i.e., they passed verify-otp). Validate it's still fresh (within 10 min of creation).
        record = PasswordResetOTP.objects.filter(
            reset_token=reset_token,
            is_used=True,
        ).first()

        if record is None:
            return Response({'error': 'Invalid or expired reset token.'}, status=status.HTTP_400_BAD_REQUEST)

        # Allow a generous window — OTP was consumed at verify step (already within 10-min expiry)
        # but give an extra 5 minutes for the user to type their new password on mobile
        grace_window = record.expires_at + timezone.timedelta(minutes=5)
        if timezone.now() > grace_window:
            return Response(
                {'error': 'Reset token has expired. Please start the process again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = ForgotPasswordView._resolve_user(record.identifier)
        if user is None:
            return Response({'error': 'User account not found.'}, status=status.HTTP_404_NOT_FOUND)

        user.set_password(new_password)
        user.save(update_fields=['password'])

        # Invalidate the token so it can't be reused
        record.reset_token = ''
        record.save(update_fields=['reset_token'])

        return Response({'detail': 'Password updated successfully. Please log in with your new password.'})
