import logging
import mimetypes
import os

from django.conf import settings
from django.contrib.auth.models import User
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import AuditLog
from patients.models import Patient
from .access import (
    DOCUMENT_LINK_MAX_AGE_SECONDS,
    check_document_read_access,
    check_document_write_access,
    filter_documents_queryset_for_user,
    is_document_admin,
    sign_document_download_token,
    verify_document_download_token,
)
from .models import Document
from .serializers import DocumentSerializer

logger = logging.getLogger(__name__)


def _authenticate_legacy_token_param(request):
    """Legacy ?token=<JWT> query auth (enabled only when DOCUMENT_LEGACY_QUERY_TOKEN=True)."""
    if not getattr(settings, 'DOCUMENT_LEGACY_QUERY_TOKEN', True):
        return None
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
    Document Management API with role/ownership access control, signed 60s download links,
    non-destructive archive instead of delete, and magic-byte upload validation.
    """
    queryset = Document.objects.select_related('uploaded_by', 'staff', 'patient', 'course', 'archived_by').all()
    serializer_class = DocumentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'owner_type', 'file_type', 'staff', 'patient', 'course', 'is_archived']
    search_fields = ['title', 'category', 'staff__first_name', 'staff__last_name', 'patient__full_name']
    ordering_fields = ['uploaded_at', 'title', 'file_size']
    ordering = ['-uploaded_at']

    def get_permissions(self):
        if self.action == 'download':
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        qs = super().get_queryset()
        archived_param = (self.request.query_params.get('archived') or '').lower().strip()
        return filter_documents_queryset_for_user(qs, self.request.user, include_archived=archived_param)

    def get_object(self):
        if self.action in ('retrieve', 'update', 'partial_update', 'download_link'):
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            obj = get_object_or_404(self.queryset, **{self.lookup_field: self.kwargs[lookup_url_kwarg]})
            check_document_read_access(self.request.user, obj)
            return obj
        obj = super().get_object()
        if self.action != 'download':
            check_document_read_access(self.request.user, obj)
        return obj

    def _resolve_patient_from_request(self, request, fallback=None):
        patient_id = request.data.get('patient')
        if isinstance(patient_id, list):
            patient_id = patient_id[0] if patient_id else None
        if patient_id:
            return Patient.objects.filter(pk=patient_id).first()
        return fallback

    def create(self, request, *args, **kwargs):
        owner_type = request.data.get('owner_type') or 'general'
        if isinstance(owner_type, list):
            owner_type = owner_type[0] or 'general'
        if owner_type == 'none':
            owner_type = 'general'
        patient = self._resolve_patient_from_request(request) if owner_type == 'patient' else None
        check_document_write_access(request.user, owner_type, patient=patient)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        owner_type = request.data.get('owner_type') or instance.owner_type
        if isinstance(owner_type, list):
            owner_type = owner_type[0] or instance.owner_type
        patient = self._resolve_patient_from_request(request, fallback=instance.patient)
        check_document_write_access(request.user, instance.owner_type, patient=instance.patient)
        check_document_write_access(request.user, owner_type, patient=patient)
        return super().update(request, *args, **kwargs)

    def _archive_document(self, request, doc):
        if not is_document_admin(request.user):
            return Response(
                {'detail': 'Only admin or super_admin may archive documents.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        reason = ''
        if hasattr(request, 'data') and isinstance(request.data, dict):
            reason = str(request.data.get('reason') or '').strip()
        if not reason:
            reason = str(request.query_params.get('reason') or '').strip()
        if not reason:
            return Response(
                {'error': 'reason_required', 'detail': 'An archive reason is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not doc.is_archived:
            doc.is_archived = True
            doc.archived_by = request.user
            doc.archived_at = timezone.now()
            doc.archive_reason = reason[:255]
            doc.save(update_fields=['is_archived', 'archived_by', 'archived_at', 'archive_reason'])
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.get_full_name() or request.user.username,
                action='Document Archived',
                target_user=f"Document #{doc.id} ({doc.title})",
                details=f"Archived document ID {doc.id} (owner_type={doc.owner_type}). Reason: {reason[:200]}",
                ip_address=request.META.get('REMOTE_ADDR'),
                timestamp=timezone.now(),
            )

        return Response(DocumentSerializer(doc, context={'request': request}).data, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        doc = get_object_or_404(Document, pk=kwargs.get('pk'))
        return self._archive_document(request, doc)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        doc = get_object_or_404(Document, pk=pk)
        return self._archive_document(request, doc)

    @action(detail=True, methods=['post'], url_path='download-link')
    def download_link(self, request, pk=None):
        doc = self.get_object()
        token = sign_document_download_token(request.user.id, doc.id)
        url = request.build_absolute_uri(f"/api/documents/{doc.id}/download/?dl={token}")
        return Response({
            'url': url,
            'expires_in': DOCUMENT_LINK_MAX_AGE_SECONDS,
            'document_id': doc.id,
        })

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        document = get_object_or_404(
            Document.objects.select_related('uploaded_by', 'staff', 'patient', 'course'),
            pk=pk,
        )

        user = None
        dl_token = request.query_params.get('dl')
        if dl_token:
            token_user_id, err = verify_document_download_token(dl_token, document.id)
            if err:
                return Response({'detail': err}, status=status.HTTP_403_FORBIDDEN)
            if request.user and request.user.is_authenticated and request.user.id != token_user_id:
                return Response({'detail': 'Download link belongs to another user.'}, status=status.HTTP_403_FORBIDDEN)
            user = User.objects.filter(pk=token_user_id, is_active=True).first()
            if not user:
                return Response({'detail': 'User account is invalid or inactive.'}, status=status.HTTP_403_FORBIDDEN)
        elif request.user and request.user.is_authenticated:
            user = request.user
        else:
            legacy_user = _authenticate_legacy_token_param(request)
            if legacy_user:
                logger.warning(
                    "Deprecated ?token= query parameter used for document download (document_id=%s, user_id=%s). "
                    "Use POST /api/documents/<id>/download-link/ and set DOCUMENT_LEGACY_QUERY_TOKEN=False once mobile is updated.",
                    document.id,
                    legacy_user.id,
                )
                user = legacy_user

        if not user:
            return Response(
                {'detail': 'Authentication credentials or valid download link required.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        check_document_read_access(user, document)

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
