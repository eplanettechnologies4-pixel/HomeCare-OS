"""
HomeCare OS — LMS Views
========================
REST endpoints for the built-in LMS module.

URL surface (all under /api/lms/):
  GET/POST     courses/                      — list all courses / create course
  GET/PUT/DEL  courses/{id}/                 — retrieve / update / delete course
  POST         courses/{id}/assign/          — assign course to one or more staff
  GET/POST     courses/{id}/lectures/        — list or add lectures to a course
  GET/PUT/DEL  lectures/{id}/               — retrieve / update / delete lecture
  POST         lectures/{id}/progress/       — watch-progress ping (mirrors GPS ping)
  GET          assignments/                  — list all assignments (admin)
  GET          assignments/{id}/             — single assignment with nested progress
  GET          assignments/{id}/certificate/ — download certificate PDF
  GET          staff/{staff_id}/training/    — all assignments for a staff member
  GET          verify/?id=CERT-XXXX         — public certificate verification (no auth)
"""
import io
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db import models
from staff.models import StaffMember
from .models import Course, Lecture, CourseAssignment, LectureProgress, Certificate
from .serializers import (
    CourseSerializer, LectureSerializer, CourseAssignmentSerializer,
    LectureProgressSerializer, CertificateSerializer, StaffTrainingSerializer,
)


# ── 1. COURSES ────────────────────────────────────────────────────────────────

class CourseViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for courses.  POST /courses/{id}/assign/ assigns to staff.
    """
    queryset = Course.objects.prefetch_related('lectures', 'assignments').filter(is_active=True)
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='assign')
    def assign(self, request, pk=None):
        """
        POST /api/lms/courses/{id}/assign/
        Body: { "staff_ids": [1, 2, 3], "due_date": "2026-12-31" (optional) }
        Creates a CourseAssignment for each staff member.
        Already-assigned staff are skipped (idempotent).
        """
        course = self.get_object()
        staff_ids = request.data.get('staff_ids', [])
        due_date  = request.data.get('due_date', None) or None

        if not staff_ids:
            return Response({'error': 'staff_ids is required (array of staff member IDs).'}, status=400)

        from staff.models import StaffMember
        created, skipped = [], []

        for sid in staff_ids:
            try:
                staff_member = StaffMember.objects.get(pk=sid)
            except StaffMember.DoesNotExist:
                continue
            assignment, was_created = CourseAssignment.objects.get_or_create(
                staff=staff_member,
                course=course,
                defaults={'assigned_by': request.user, 'due_date': due_date},
            )
            if was_created:
                created.append(sid)
            else:
                skipped.append(sid)

        return Response({
            'course': course.title,
            'assigned': created,
            'already_assigned': skipped,
        }, status=status.HTTP_201_CREATED)


# ── 2. LECTURES ───────────────────────────────────────────────────────────────

class LectureViewSet(viewsets.ModelViewSet):
    """
    CRUD for lectures within a course.
    Accepts multipart uploads for video_file (same pattern as DailyReport photo uploads).
    """
    queryset = Lecture.objects.select_related('course').all()
    serializer_class = LectureSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        course_id = self.request.query_params.get('course')
        if course_id:
            qs = qs.filter(course_id=course_id)
        return qs


# ── 3. WATCH-PROGRESS PING ────────────────────────────────────────────────────

class LectureProgressView(APIView):
    """
    POST /api/lms/lectures/{lecture_id}/progress/

    Periodic watch-progress ping — mirrors the 30-second GPS ping architecture
    already in tracking/views.py GPSPingView.

    Body (JSON):
      { "watched_seconds": 1800, "percentage": 67.5 }

    The staff member is resolved from their JWT (never trust client).
    CourseAssignment status is recalculated after every ping.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, lecture_id):
        # Resolve staff from JWT
        try:
            from staff.models import StaffMember
            staff = StaffMember.objects.get(user=request.user)
        except StaffMember.DoesNotExist:
            # Admin/super_admin calling directly (e.g. for testing)
            staff = None

        try:
            lecture = Lecture.objects.get(pk=lecture_id)
        except Lecture.DoesNotExist:
            return Response({'error': 'Lecture not found.'}, status=404)

        watched_seconds = int(request.data.get('watched_seconds', 0))
        percentage      = float(request.data.get('percentage', 0))

        # For admin testing: allow specifying staff_id override
        staff_id_override = request.data.get('staff_id')
        if staff is None and staff_id_override:
            try:
                from staff.models import StaffMember
                staff = StaffMember.objects.get(pk=staff_id_override)
            except StaffMember.DoesNotExist:
                return Response({'error': 'Staff member not found.'}, status=404)

        if staff is None:
            return Response({'error': 'No StaffMember profile found for this user. Pass staff_id to override.'}, status=403)

        # Find the assignment for this staff + course
        try:
            assignment = CourseAssignment.objects.get(staff=staff, course=lecture.course)
        except CourseAssignment.DoesNotExist:
            return Response({'error': 'This course has not been assigned to this staff member.'}, status=404)

        # Upsert progress (mirrors LocationPing.objects.create pattern but uses get_or_create for idempotency)
        progress, _ = LectureProgress.objects.get_or_create(
            assignment=assignment,
            lecture=lecture,
        )
        # Only advance (never rewind)
        if watched_seconds > progress.watched_seconds:
            progress.watched_seconds = watched_seconds
        if float(percentage) > float(progress.percentage):
            progress.percentage = percentage
        progress.save()

        # Recalculate assignment status (may flip to 'completed' + issue certificate)
        assignment.recalculate_status()
        assignment.refresh_from_db()

        return Response({
            'lecture_id':       lecture.id,
            'watched_seconds':  progress.watched_seconds,
            'percentage':       float(progress.percentage),
            'completed':        progress.completed,
            'assignment_status': assignment.status,
            'certificate_issued': hasattr(assignment, 'certificate'),
        })


# ── 4. ASSIGNMENTS ────────────────────────────────────────────────────────────

class CourseAssignmentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CourseAssignment.objects.select_related(
        'staff', 'course', 'assigned_by'
    ).prefetch_related('lecture_progresses__lecture', 'certificate').all()
    serializer_class = CourseAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        staff_id  = self.request.query_params.get('staff')
        course_id = self.request.query_params.get('course')
        status_f  = self.request.query_params.get('status')
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        if course_id:
            qs = qs.filter(course_id=course_id)
        if status_f:
            qs = qs.filter(status=status_f)
        return qs

    @action(detail=True, methods=['get'], url_path='certificate')
    def certificate(self, request, pk=None):
        """
        GET /api/lms/assignments/{id}/certificate/
        Serves the certificate PDF as a download.
        Generates it if not yet created (e.g. if generation previously failed).
        """
        assignment = self.get_object()

        if assignment.status != CourseAssignment.Status.COMPLETED:
            return Response({'error': 'Course not yet completed — no certificate available.'}, status=400)

        cert = getattr(assignment, 'certificate', None)
        if not cert:
            cert = Certificate.issue(assignment)

        if cert.pdf_file:
            try:
                pdf_file = cert.pdf_file.open('rb')
                response = FileResponse(pdf_file, content_type='application/pdf')
                response['Content-Disposition'] = (
                    f'attachment; filename="{cert.certificate_number}.pdf"'
                )
                return response
            except Exception:
                pass

        # Fallback: re-generate in-memory
        from reports.pdf_generator import HomeCarePDFGenerator
        data = {
            'certificate_number': cert.certificate_number,
            'staff_name':         assignment.staff.full_name,
            'course_title':       assignment.course.title,
            'completion_date':    assignment.completed_date.strftime('%d %B %Y') if assignment.completed_date else '',
            'issued_date':        cert.issued_date.strftime('%d %B %Y'),
            'category':           assignment.course.get_category_display(),
        }
        pdf_bytes = HomeCarePDFGenerator('certificate', data, generated_by='HomeCare OS LMS').generate()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{cert.certificate_number}.pdf"'
        return response


# ── 5. PER-STAFF TRAINING VIEW ────────────────────────────────────────────────

class StaffTrainingView(APIView):
    """
    GET /api/lms/staff/{staff_id}/training/
    Returns all CourseAssignments for a staff member, with nested progress data.
    Used by the Staff Profile Training tab.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, staff_id):
        assignments = CourseAssignment.objects.filter(
            staff_id=staff_id
        ).select_related('course').prefetch_related(
            'course__lectures', 'lecture_progresses__lecture', 'certificate'
        )
        serializer = StaffTrainingSerializer(assignments, many=True, context={'request': request})
        return Response(serializer.data)


# ── 6. CERTIFICATE VIEWSET (GENERAL / ADMIN GENERATOR) ─────────────────────────

class CertificateViewSet(viewsets.ModelViewSet):
    """
    General Certificate Management:
    - GET  /api/lms/certificates/             — list certificates (optional ?staff_id=X or ?search=...)
    - POST /api/lms/certificates/             — manually generate certificate for staff or custom recipient
    - GET  /api/lms/certificates/{id}/        — retrieve certificate details
    - GET  /api/lms/certificates/{id}/download/ — stream PDF directly (inline or download)
    """
    queryset = Certificate.objects.select_related('staff', 'generated_by', 'assignment', 'assignment__course').all()
    serializer_class = CertificateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        staff_id = self.request.query_params.get('staff_id')
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                models.Q(recipient_name__icontains=search) |
                models.Q(title__icontains=search) |
                models.Q(certificate_id__icontains=search)
            )
        return qs

    def create(self, request, *args, **kwargs):
        assignment_id = request.data.get('assignment')
        staff_id = request.data.get('staff')

        if assignment_id:
            try:
                assignment = CourseAssignment.objects.select_related('staff', 'course').get(id=assignment_id)
                if staff_id and str(assignment.staff_id) != str(staff_id):
                    return Response({
                        'error': f"The selected course assignment ({assignment.course.title}) belongs to {assignment.staff.full_name}, not the selected recipient."
                    }, status=status.HTTP_400_BAD_REQUEST)
                if Certificate.objects.filter(assignment=assignment).exists():
                    return Response({
                        'error': f"A certificate has already been issued for this course assignment ({assignment.course.title})."
                    }, status=status.HTTP_400_BAD_REQUEST)
            except CourseAssignment.DoesNotExist:
                return Response({'error': 'Selected course assignment does not exist.'}, status=status.HTTP_400_BAD_REQUEST)

        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        staff_id = self.request.data.get('staff')
        recipient_name = self.request.data.get('recipient_name', '').strip()
        if staff_id and not recipient_name:
            try:
                st = StaffMember.objects.get(id=staff_id)
                recipient_name = st.full_name
            except StaffMember.DoesNotExist:
                pass

        cert = serializer.save(
            recipient_name=recipient_name,
            generated_by=self.request.user if self.request.user.is_authenticated else None
        )
        cert.generate_pdf(save_file=True)

    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def download(self, request, pk=None):
        cert = self.get_object()
        if not cert.pdf_file:
            cert.generate_pdf(save_file=True)
            cert.refresh_from_db()

        if cert.pdf_file:
            try:
                pdf_file = cert.pdf_file.open('rb')
                response = FileResponse(pdf_file, content_type='application/pdf')
                response['Content-Disposition'] = f'inline; filename="{cert.certificate_id or cert.certificate_number}.pdf"'
                return response
            except Exception:
                pass

        pdf_bytes = cert.generate_pdf(save_file=False)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{cert.certificate_id or cert.certificate_number}.pdf"'
        return response


# ── 7. PER-STAFF CERTIFICATES VIEW ───────────────────────────────────────────

class StaffCertificatesView(APIView):
    """
    GET /api/lms/staff/{staff_id}/certificates/
    Returns all certificates ever issued to this staff member (both course-auto-generated
    and manually-generated standalone awards/recognitions).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, staff_id):
        certs = Certificate.objects.filter(staff_id=staff_id).select_related('staff', 'generated_by', 'assignment', 'assignment__course')
        serializer = CertificateSerializer(certs, many=True, context={'request': request})
        return Response(serializer.data)


# ── 8. PUBLIC REAL-TIME CERTIFICATE VERIFICATION ──────────────────────────────

class CertificateVerifyView(APIView):
    """
    Public (no-auth) verification endpoint.
    GET /api/certificates/verify/{certificate_id}/
    GET /api/lms/verify/?id=CERT-XXXX
    GET /api/lms/verify/{certificate_id}/
    Real-time lookup against Certificate database with validation status.
    """
    permission_classes = [AllowAny]

    def get(self, request, certificate_id=None):
        cert_id = certificate_id or request.query_params.get('id', '')
        cert_id = cert_id.strip()
        if not cert_id:
            return Response({'valid': False, 'error': 'Certificate ID is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cert = Certificate.objects.select_related(
                'staff', 'generated_by', 'assignment__course'
            ).get(
                models.Q(certificate_id__iexact=cert_id) |
                models.Q(certificate_number__iexact=cert_id)
            )
        except Certificate.DoesNotExist:
            return Response({
                'valid': False,
                'error': 'Certificate not found / invalid. The supplied certificate ID does not exist in the official eHealth registry.'
            }, status=status.HTTP_404_NOT_FOUND)

        recipient = cert.recipient_name or (cert.staff.full_name if cert.staff else 'Recipient')
        issue_date_str = cert.issue_date.strftime('%d %B %Y') if cert.issue_date else ''

        pdf_url = None
        if cert.pdf_file:
            pdf_url = request.build_absolute_uri(cert.pdf_file.url)
        else:
            pdf_url = request.build_absolute_uri(f"/api/lms/certificates/{cert.id}/download/")

        return Response({
            'valid': True,
            'certificate_id': cert.certificate_id or cert.certificate_number,
            'certificate_number': cert.certificate_number,
            'recipient_name': recipient,
            'title': cert.title,
            'description': cert.description or 'For demonstrating professional clinical excellence and adherence to healthcare standards.',
            'issue_date': issue_date_str,
            'issuing_organization': 'eHealth Hospital At Home',
            'registered_with': [
                'IHRA (Islamabad Healthcare Regulatory Authority)',
                'SECP (Securities and Exchange Commission of Pakistan)'
            ],
            'staff_role': (cert.staff.get_role_display() if hasattr(cert.staff, 'get_role_display') else getattr(cert.staff, 'role', None)) if cert.staff else None,
            'pdf_url': pdf_url,
            'verification_timestamp': timezone.now().strftime('%Y-%m-%d %H:%M:%S UTC'),
        })

