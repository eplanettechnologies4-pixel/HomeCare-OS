import mimetypes
import os

from django.conf import settings
from django.db.models import Q
from django.http import FileResponse, Http404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from staff.models import StaffMember
from .access import check_document_read_access, is_document_admin
from .models import Document


def _safe_media_path(subdir: str, filepath: str):
    base_dir = os.path.normpath(os.path.join(settings.MEDIA_ROOT, subdir))
    target_path = os.path.normpath(os.path.join(base_dir, filepath))
    if not (target_path == base_dir or target_path.startswith(base_dir + os.sep)):
        return None, None
    rel_path = os.path.join(subdir, filepath).replace('\\', '/')
    return target_path, rel_path


def _serve_protected_file(target_path: str):
    if not os.path.isfile(target_path):
        raise Http404("File not found.")
    content_type, _ = mimetypes.guess_type(target_path)
    if not content_type:
        content_type = 'application/octet-stream'
    return FileResponse(open(target_path, 'rb'), content_type=content_type)


class ProtectedDocumentMediaView(APIView):
    """
    Authenticated media route for /media/documents/<filepath> applying Document access rules.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, filepath):
        target_path, rel_path = _safe_media_path('documents', filepath)
        if not target_path:
            return Response({'detail': 'Invalid file path.'}, status=status.HTTP_400_BAD_REQUEST)

        if not os.path.isfile(target_path):
            raise Http404("Document file not found.")

        doc = Document.objects.select_related('staff', 'patient', 'course').filter(file=rel_path).first()
        if not doc:
            if is_document_admin(request.user):
                return _serve_protected_file(target_path)
            return Response({'detail': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

        check_document_read_access(request.user, doc)
        return _serve_protected_file(target_path)


class ProtectedIdCardMediaView(APIView):
    """
    Authenticated media route for /media/staff_id_cards/<filepath> and /media/id_cards/<filepath>.
    Allowed ONLY for admin/super_admin and the owning StaffMember.
    """
    permission_classes = [permissions.IsAuthenticated]
    subdir = 'staff_id_cards'

    def get(self, request, filepath):
        target_path, rel_path = _safe_media_path(self.subdir, filepath)
        if not target_path:
            return Response({'detail': 'Invalid file path.'}, status=status.HTTP_400_BAD_REQUEST)

        if not os.path.isfile(target_path):
            raise Http404("ID card image not found.")

        if is_document_admin(request.user):
            return _serve_protected_file(target_path)

        is_owner = StaffMember.objects.filter(user=request.user).filter(
            Q(id_card_front=rel_path) | Q(id_card_back=rel_path)
        ).exists()
        if is_owner:
            return _serve_protected_file(target_path)

        return Response({'detail': 'You do not have permission to view this ID card.'}, status=status.HTTP_403_FORBIDDEN)

