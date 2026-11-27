import os
import mimetypes
from django.http import FileResponse, Http404
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth.models import User
from django_filters.rest_framework import DjangoFilterBackend

from .models import Document
from .serializers import DocumentSerializer


def _authenticate_token_param(request):
    """Fallback authentication using ?token=<JWT> query parameter for direct browser downloads."""
    token = request.query_params.get('token')
    if not token:
        return None
    try:
        decoded = AccessToken(token)
        user_id = decoded['user_id']
        return User.objects.filter(pk=user_id, is_active=True).first()
    except Exception:
        return None


class DocumentViewSet(viewsets.ModelViewSet):
    """
    Admin & HR Document Management API.
    Supports MultiPartParser & FormParser for files up to 200MB/2GB.
    Download action supports JWT header or ?token=<JWT> query param.
    """
    queryset = Document.objects.select_related('uploaded_by', 'staff', 'patient', 'course').all()
    serializer_class = DocumentSerializer
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'owner_type', 'file_type', 'staff', 'patient', 'course']
    search_fields = ['title', 'category', 'staff__first_name', 'staff__last_name', 'patient__full_name']
    ordering_fields = ['uploaded_at', 'title', 'file_size']
    ordering = ['-uploaded_at']

    def get_permissions(self):
        # Allow download action to authenticate via query param token
        if self.action == 'download':
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        from django.conf import settings
        if getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False) and user and user.is_authenticated and not user.is_superuser:
            from homecareOS.permissions import get_user_role
            from staff.pin_service import FIELD_PIN_ROLES, is_patient_unlocked_for_user
            if get_user_role(user) in FIELD_PIN_ROLES:
                pids = set(qs.exclude(patient_id__isnull=True).values_list('patient_id', flat=True))
                locked_pids = {pid for pid in pids if not is_patient_unlocked_for_user(user, pid)[0]}
                if locked_pids:
                    qs = qs.exclude(patient_id__in=locked_pids)
        return qs

    def get_object(self):
        obj = super().get_object()
        if self.action != 'download' and obj.patient_id:
            from staff.pin_service import require_patient_file_unlock
            require_patient_file_unlock(self.request.user, obj.patient_id)
        return obj

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        document = self.get_object()

        # Check authentication: request.user (from header) or ?token= param
        user = request.user if (request.user and request.user.is_authenticated) else _authenticate_token_param(request)
        if not user:
            return Response(
                {'detail': 'Authentication credentials were not provided or token is invalid.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        if document.patient_id:
            from staff.pin_service import require_patient_file_unlock
            require_patient_file_unlock(user, document.patient_id)

        if not document.file or not document.file.storage.exists(document.file.name):
            raise Http404("Document file does not exist on storage.")

        file_handle = document.file.open('rb')
        content_type, _ = mimetypes.guess_type(document.file.name)
        if not content_type:
            content_type = 'application/octet-stream'

        filename = os.path.basename(document.file.name)
        response = FileResponse(file_handle, content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        response['Content-Length'] = document.file.size
        return response
