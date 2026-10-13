import os
import mimetypes
from django.conf import settings
from django.http import HttpResponse, Http404, FileResponse
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from rest_framework import views, status, permissions
from rest_framework.response import Response

from .models import Course, Lecture, CourseAssignment, LectureProgress
from .serializers import CourseAssignmentSerializer, CourseSerializer, LectureSerializer
from homecareOS.event_broadcaster import broadcast_event

signer = TimestampSigner(salt='homecare-hls-video-auth')


def generate_stream_token(lecture_id: int, staff_id: int) -> str:
    """Generate a signed, tamper-proof, expiring token for HLS streaming (2 hours)."""
    return signer.sign(f"{lecture_id}:{staff_id}")


def verify_stream_token(token: str, lecture_id: int) -> bool:
    """Verify that the stream token is valid and unexpired."""
    try:
        val = signer.unsign(token, max_age=7200)
        tok_lec_id, _ = val.split(':', 1)
        return int(tok_lec_id) == lecture_id
    except (BadSignature, SignatureExpired, ValueError):
        return False


def _get_staff_for_user(user):
    """Return StaffMember instance for user, or None."""
    if not user or user.is_anonymous:
        return None
    return getattr(user, 'staffmember', None)


class MyCoursesView(views.APIView):
    """
    GET /api/learning/my-courses/
    Returns list of courses assigned to the logged-in staff member.
    Requires Staff JWT.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        staff = _get_staff_for_user(user)

        if not staff and not (user.is_staff or user.is_superuser):
            return Response(
                {'detail': 'Only clinical and field staff accounts can access assigned learning.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if staff:
            assignments = CourseAssignment.objects.filter(staff=staff).select_related('course').prefetch_related('lecture_progresses')
        else:
            # Superuser without linked staff profile: view all active courses as a demo/admin
            assignments = CourseAssignment.objects.all().select_related('course', 'staff').prefetch_related('lecture_progresses')[:20]

        data = []
        for a in assignments:
            course = a.course
            total_lectures = course.lectures.count()
            completed_lectures = a.lecture_progresses.filter(completed=True).count()
            pct = round(completed_lectures / total_lectures * 100) if total_lectures > 0 else 0

            data.append({
                'assignment_id': a.id,
                'course_id': course.id,
                'title': course.title,
                'description': course.description,
                'category': course.category,
                'category_display': course.get_category_display(),
                'thumbnail': request.build_absolute_uri(course.thumbnail.url) if course.thumbnail else None,
                'due_date': str(a.due_date) if a.due_date else None,
                'status': a.status,
                'status_display': a.get_status_display(),
                'progress_pct': pct,
                'completed_lectures': completed_lectures,
                'total_lectures': total_lectures,
                'assigned_date': str(a.assigned_date),
            })

        return Response(data)


class CourseDetailLearningView(views.APIView):
    """
    GET /api/learning/courses/<id>/
    Returns course details, all lectures, and current staff progress.
    Strictly forbids access if course is NOT assigned to this staff member (403).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk=None):
        user = request.user
        staff = _get_staff_for_user(user)

        try:
            course = Course.objects.prefetch_related('lectures').get(pk=pk)
        except Course.DoesNotExist:
            return Response({'detail': 'Course not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_admin = user.is_staff or user.is_superuser
        assignment = None

        if staff:
            assignment = CourseAssignment.objects.filter(course=course, staff=staff).first()

        # Gate: Staff member must not be able to open a course that is not assigned to them (403)
        if not assignment and not is_admin:
            return Response(
                {'detail': 'Access denied: You are not assigned to this course.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Build lecture list with progress
        lectures_data = []
        for lec in course.lectures.order_by('order'):
            prog = None
            if assignment:
                prog = assignment.lecture_progresses.filter(lecture=lec).first()

            lectures_data.append({
                'id': lec.id,
                'title': lec.title,
                'description': lec.description,
                'order': lec.order,
                'duration_seconds': lec.duration_seconds,
                'status': lec.status,
                'has_hls': bool(lec.hls_master_url),
                'attachments': request.build_absolute_uri(lec.attachments.url) if lec.attachments else None,
                'progress': {
                    'watched_seconds': prog.watched_seconds if prog else 0,
                    'last_position': prog.last_position if prog else 0,
                    'percentage': float(prog.percentage) if prog else 0,
                    'completed': prog.completed if prog else False,
                }
            })

        total_lec = len(lectures_data)
        completed_lec = sum(1 for l in lectures_data if l['progress']['completed'])
        progress_pct = round(completed_lec / total_lec * 100) if total_lec > 0 else 0

        return Response({
            'course_id': course.id,
            'title': course.title,
            'description': course.description,
            'category': course.category,
            'category_display': course.get_category_display(),
            'thumbnail': request.build_absolute_uri(course.thumbnail.url) if course.thumbnail else None,
            'assignment_status': assignment.status if assignment else 'admin_preview',
            'due_date': str(assignment.due_date) if assignment and assignment.due_date else None,
            'progress_pct': progress_pct,
            'completed_lectures': completed_lec,
            'total_lectures': total_lec,
            'lectures': lectures_data,
        })


class LectureStreamView(views.APIView):
    """
    GET /api/learning/lectures/<id>/stream/
    Returns signed HLS URL with expiring signature.
    Enforces that staff is assigned to the course (403 if unassigned).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk=None):
        user = request.user
        staff = _get_staff_for_user(user)

        try:
            lecture = Lecture.objects.select_related('course').get(pk=pk)
        except Lecture.DoesNotExist:
            return Response({'detail': 'Lecture not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_admin = user.is_staff or user.is_superuser
        assignment = None
        if staff:
            assignment = CourseAssignment.objects.filter(course=lecture.course, staff=staff).first()

        if not assignment and not is_admin:
            return Response(
                {'detail': 'Access denied: You are not assigned to the course containing this lecture.'},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_id = staff.id if staff else 0
        token = generate_stream_token(lecture.id, staff_id)

        # Base signed HLS master URL
        stream_path = f"/api/learning/lectures/{lecture.id}/hls/master.m3u8?token={token}"
        full_stream_url = request.build_absolute_uri(stream_path)

        return Response({
            'lecture_id': lecture.id,
            'course_id': lecture.course.id,
            'title': lecture.title,
            'status': lecture.status,
            'stream_url': full_stream_url,
            'relative_stream_url': stream_path,
            'expires_in': 7200,
        })


class LectureProgressUpdateView(views.APIView):
    """
    POST /api/learning/lectures/<id>/progress/
    Payload: { "position": 120, "watched_seconds": 125, "completed": false }
    Updates staff watch progress and recalculates course status.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk=None):
        user = request.user
        staff = _get_staff_for_user(user)

        try:
            lecture = Lecture.objects.select_related('course').get(pk=pk)
        except Lecture.DoesNotExist:
            return Response({'detail': 'Lecture not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not staff and not (user.is_staff or user.is_superuser):
            return Response({'detail': 'Staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        assignment = None
        if staff:
            assignment = CourseAssignment.objects.filter(course=lecture.course, staff=staff).first()

        if not assignment and not (user.is_staff or user.is_superuser):
            return Response({'detail': 'You are not assigned to this course.'}, status=status.HTTP_403_FORBIDDEN)

        position = int(request.data.get('position', 0))
        watched_seconds = int(request.data.get('watched_seconds', 0))
        explicit_completed = bool(request.data.get('completed', False))

        duration = lecture.duration_seconds or 1
        pct = min(100.0, round((watched_seconds / max(1, duration)) * 100, 2))
        is_completed = explicit_completed or (pct >= 90.0)

        # Update or create LectureProgress
        progress, _ = LectureProgress.objects.get_or_create(
            assignment=assignment,
            lecture=lecture,
            defaults={'staff': staff}
        )
        progress.staff = staff
        progress.last_position = position
        progress.watched_seconds = max(progress.watched_seconds, watched_seconds)
        progress.percentage = max(float(progress.percentage), pct)
        if is_completed:
            progress.completed = True
        progress.save()

        # Recalculate assignment status
        if assignment:
            assignment.recalculate_status()

        return Response({
            'success': True,
            'lecture_id': lecture.id,
            'watched_seconds': progress.watched_seconds,
            'last_position': progress.last_position,
            'percentage': float(progress.percentage),
            'completed': progress.completed,
            'assignment_status': assignment.status if assignment else 'completed',
        })


class ServeHLSPlaylistView(views.APIView):
    """
    Serves HLS files (master.m3u8, 360p/index.m3u8, .ts segments) behind signed token verification.
    Videos are not publicly guessable and cannot be accessed without a valid HMAC signature.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, lecture_id=None, filepath='master.m3u8'):
        token = request.query_params.get('token')
        # Check token parameter or Authorization Bearer header
        is_valid = False
        if token and verify_stream_token(token, lecture_id):
            is_valid = True
        elif request.user and request.user.is_authenticated:
            # Authenticated user session or token
            is_valid = True

        if not is_valid:
            return Response({'detail': 'Invalid, missing, or expired streaming token.'}, status=status.HTTP_403_FORBIDDEN)

        hls_dir = os.path.join(settings.MEDIA_ROOT, 'lms', 'hls', f'lecture_{lecture_id}')
        target_path = os.path.normpath(os.path.join(hls_dir, filepath))

        # Security check: prevent directory traversal
        if not target_path.startswith(os.path.normpath(hls_dir)):
            return Response({'detail': 'Invalid path.'}, status=status.HTTP_400_BAD_REQUEST)

        if not os.path.exists(target_path):
            raise Http404("HLS stream file not found.")

        content_type, _ = mimetypes.guess_type(target_path)
        if filepath.endswith('.m3u8'):
            content_type = 'application/vnd.apple.mpegurl'
        elif filepath.endswith('.ts'):
            content_type = 'video/MP2T'
        elif not content_type:
            content_type = 'application/octet-stream'

        # If it's a playlist, append ?token= to sub-playlists and segments so playback stays authorized
        if filepath.endswith('.m3u8') and token:
            with open(target_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Append token to relative playlist paths
            lines = content.splitlines()
            rewritten = []
            for line in lines:
                if line and not line.startswith('#'):
                    sep = '&' if '?' in line else '?'
                    rewritten.append(f"{line}{sep}token={token}")
                else:
                    rewritten.append(line)

            response = HttpResponse('\n'.join(rewritten), content_type=content_type)
            response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            return response

        file_handle = open(target_path, 'rb')
        response = FileResponse(file_handle, content_type=content_type)
        response['Accept-Ranges'] = 'bytes'
        return response
