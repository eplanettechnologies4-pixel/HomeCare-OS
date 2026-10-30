"""
Protected Media Serving View for LMS Files
Ensures staff/nurses can only access videos, attachments, and certificates
belonging to their assigned courses.
"""
import os
import mimetypes
from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.db.models import Q

from .permissions import is_lms_manager
from .models import Lecture, Certificate


class ProtectedLMSMediaView(APIView):
    """
    Route-level media protection for LMS uploads (/media/lms/<filepath>).
    Blocks unauthenticated users and field staff trying to access media files
    for courses that have not been assigned to them.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, filepath):
        user = request.user
        base_dir = os.path.normpath(os.path.join(settings.MEDIA_ROOT, 'lms'))
        target_path = os.path.normpath(os.path.join(base_dir, filepath))

        # Security: prevent directory traversal
        if not target_path.startswith(base_dir):
            return Response({'detail': 'Invalid file path.'}, status=status.HTTP_400_BAD_REQUEST)

        if not os.path.exists(target_path):
            raise Http404("File not found.")

        # Admins, super admins, branch managers, care managers have universal access
        if is_lms_manager(user):
            return self._serve_file(target_path)

        filename = os.path.basename(target_path)

        # Thumbnails are non-sensitive course previews
        if filepath.startswith('thumbnails'):
            return self._serve_file(target_path)

        # Certificates: only the certificate owner can access their PDF
        if filepath.startswith('certificates'):
            has_cert = Certificate.objects.filter(
                staff__user=user
            ).filter(
                Q(pdf_file__endswith=filename) | Q(certificate_id__icontains=filename) | Q(certificate_number__icontains=filename)
            ).exists()
            if has_cert:
                return self._serve_file(target_path)
            return Response(
                {'detail': 'Access denied: You can only access your own certificates.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Video or Attachment files: staff member must be assigned to the course containing this lecture
        has_access = Lecture.objects.filter(
            course__assignments__staff__user=user
        ).filter(
            Q(video_file__endswith=filename) | Q(attachments__endswith=filename)
        ).exists()

        if has_access:
            return self._serve_file(target_path)

        return Response(
            {'detail': 'Access denied: You are not assigned to the course containing this media file.'},
            status=status.HTTP_403_FORBIDDEN
        )

    def _serve_file(self, target_path):
        content_type, _ = mimetypes.guess_type(target_path)
        if not content_type:
            content_type = 'application/octet-stream'
        response = FileResponse(open(target_path, 'rb'), content_type=content_type)
        response['Accept-Ranges'] = 'bytes'
        return response
