import os
import uuid
import datetime
import secrets
from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.exceptions import PermissionDenied

from homecareOS.permissions import get_user_role
from accounts.models import AuditLog
from .models import (
    StaffMember, StaffRequirementType, StaffRequirement,
    StaffDocument, StaffAssessment, StaffFeedback,
    StaffStageEvent, StaffActivationCode
)
from .serializers import (
    StaffRequirementSerializer, StaffDocumentSerializer,
    StaffAssessmentSerializer, StaffFeedbackSerializer,
    StaffStageEventSerializer, StaffListSerializer
)


def _check_onboarding_access(request, staff):
    """
    Returns (allowed: bool, is_read_only: bool, error_msg: str)
    Rules:
    - super_admin, admin: full access
    - staff member themself: full access
    - branch_manager: read-only status without files
    - all others: 403 Forbidden
    """
    actor = request.user
    if not actor or not actor.is_authenticated:
        return False, False, "Authentication required."

    actor_role = get_user_role(actor)
    is_sa_or_admin = (actor_role in ('super_admin', 'admin')) or getattr(actor, 'is_superuser', False)
    is_self = staff.user_id == actor.id
    is_branch_mgr = (actor_role == 'branch_manager')

    if is_sa_or_admin or is_self:
        return True, False, ""
    elif is_branch_mgr:
        return True, True, ""
    return False, False, "You do not have permission to view staff onboarding details."


def _validate_document_file(uploaded_file):
    """
    Validates file size (max 10MB) and content type from header magic bytes.
    Allowed: PDF, JPEG, PNG.
    """
    max_mb = getattr(settings, 'STAFF_DOCUMENT_MAX_MB', 10)
    max_bytes = max_mb * 1024 * 1024
    if uploaded_file.size > max_bytes:
        raise DjangoValidationError(f"File size exceeds maximum allowed limit of {max_mb} MB.")

    pos = uploaded_file.tell()
    header = uploaded_file.read(1024)
    uploaded_file.seek(pos)

    is_pdf = header.startswith(b'%PDF')
    is_jpeg = header.startswith(b'\xff\xd8\xff')
    is_png = header.startswith(b'\x89PNG\r\n\x1a\n')

    if not (is_pdf or is_jpeg or is_png):
        raise DjangoValidationError("Invalid file type. Only PDF, JPEG, and PNG files are accepted.")

    if is_pdf:
        return 'application/pdf'
    elif is_jpeg:
        return 'image/jpeg'
    elif is_png:
        return 'image/png'


# ── Onboarding Summary View ───────────────────────────────────────────────────

class StaffOnboardingSummaryView(APIView):
    """
    GET /api/staff/<id>/onboarding/
    Returns stage, progress counts, missing requirements, review-due flag,
    requirements checklist, and stage history.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        staff = get_object_or_404(StaffMember, pk=pk)
        allowed, is_read_only, msg = _check_onboarding_access(request, staff)
        if not allowed:
            return Response({'error': msg}, status=status.HTTP_403_FORBIDDEN)

        today = timezone.now().date()

        # Review due flag
        review_due = False
        if staff.lifecycle_stage == 'probation' and staff.probation_end_date:
            days_left = (staff.probation_end_date - today).days
            review_due = (days_left <= 14)

        # Requirements breakdown
        reqs = staff.requirements.select_related('requirement_type', 'verified_by', 'waived_by').prefetch_related(
            'documents', 'assessments', 'feedbacks'
        ).order_by('requirement_type__gate', 'requirement_type__sort_order')

        # Progress calculation
        t_reqs = [r for r in reqs if r.requirement_type.gate == 'trainee_to_probation' and r.requirement_type.is_active]
        p_reqs = [r for r in reqs if r.requirement_type.gate == 'probation_to_active' and r.requirement_type.is_active]

        def check_req_complete(r):
            if r.status in ('verified', 'waived'):
                # For document types requiring count > 1 (e.g. guardian_id count 2)
                if r.status == 'waived':
                    return True
                if r.requirement_type.kind == 'document' and r.requirement_type.required_count > 1:
                    cur_docs_count = r.documents.filter(is_current=True).count()
                    return cur_docs_count >= r.requirement_type.required_count
                return True
            return False

        t_total = len(t_reqs)
        t_done = sum(1 for r in t_reqs if check_req_complete(r))
        p_total = len(p_reqs)
        p_done = sum(1 for r in p_reqs if check_req_complete(r))

        missing_trainee = []
        for r in t_reqs:
            if not check_req_complete(r):
                if r.requirement_type.kind == 'document' and r.requirement_type.required_count > 1:
                    cur_docs = r.documents.filter(is_current=True).count()
                    missing_trainee.append(f"{r.requirement_type.label} ({cur_docs}/{r.requirement_type.required_count} uploaded)")
                else:
                    missing_trainee.append(r.requirement_type.label)

        missing_probation = []
        for r in p_reqs:
            if not check_req_complete(r):
                missing_probation.append(r.requirement_type.label)

        can_advance_to_probation = (staff.lifecycle_stage == 'trainee') and (len(missing_trainee) == 0) and (t_total > 0)
        can_advance_to_active = (staff.lifecycle_stage == 'probation') and (len(missing_probation) == 0) and (p_total > 0)

        # Serialize
        serialized_reqs = StaffRequirementSerializer(reqs, many=True, context={'request': request}).data

        # If read-only (branch_manager), strip document download links and sensitive details
        if is_read_only:
            for sr in serialized_reqs:
                for doc in sr.get('documents', []):
                    doc['download_url'] = None

        events = staff.stage_events.select_related('decided_by').order_by('-decided_at')
        serialized_events = StaffStageEventSerializer(events, many=True).data

        payload = {
            'staff': {
                'id': staff.id,
                'full_name': staff.full_name,
                'employee_id': staff.employee_id,
                'role': staff.role,
                'role_display': staff.get_role_display(),
                'email': staff.email,
                'phone': staff.phone,
                'photo': staff.photo.url if staff.photo else None,
                'lifecycle_stage': staff.lifecycle_stage,
                'lifecycle_stage_display': staff.get_lifecycle_stage_display(),
                'trainee_started_at': staff.trainee_started_at,
                'probation_started_at': staff.probation_started_at,
                'probation_end_date': staff.probation_end_date,
                'active_since': staff.active_since,
                'review_due': review_due,
            },
            'progress': {
                'trainee_to_probation': {
                    'total': t_total,
                    'completed': t_done,
                    'percentage': int((t_done / t_total) * 100) if t_total > 0 else 0,
                    'docs_label': f"Docs {t_done}/{t_total}",
                },
                'probation_to_active': {
                    'total': p_total,
                    'completed': p_done,
                    'percentage': int((p_done / p_total) * 100) if p_total > 0 else 0,
                    'docs_label': f"Assessments & Feedback {p_done}/{p_total}",
                },
            },
            'can_advance_to_probation': can_advance_to_probation,
            'can_advance_to_active': can_advance_to_active,
            'missing_trainee_requirements': missing_trainee,
            'missing_probation_requirements': missing_probation,
            'requirements': serialized_reqs,
            'stage_events': serialized_events,
        }

        return Response(payload)


# ── Regenerate Activation Code ────────────────────────────────────────────────

class StaffRegenerateCodeView(APIView):
    """
    POST /api/staff/<id>/regenerate-code/
    Invalidates any existing active code and generates a new one-time activation code.
    Admin / super_admin only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor_role = get_user_role(request.user)
        if actor_role not in ('super_admin', 'admin') and not getattr(request.user, 'is_superuser', False):
            return Response({'error': 'Only administrators can regenerate activation codes.'}, status=status.HTTP_403_FORBIDDEN)

        staff = get_object_or_404(StaffMember, pk=pk)

        # Invalidate previous unused codes
        StaffActivationCode.objects.filter(staff=staff, used_at__isnull=True).update(expires_at=timezone.now())

        # Generate new 8-char code
        charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
        code = ''.join(secrets.choice(charset) for _ in range(8))
        act_days = getattr(settings, 'STAFF_ACTIVATION_CODE_DAYS', 7)
        expires_at = timezone.now() + datetime.timedelta(days=act_days)

        code_obj = StaffActivationCode.objects.create(
            staff=staff,
            code_hash=make_password(code),
            created_by=request.user,
            expires_at=expires_at,
        )

        try:
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.username,
                action='Regenerated Staff Activation Code',
                target_user=staff.user.username if staff.user else '',
                details=f"Regenerated activation code for staff {staff.full_name}.",
            )
        except Exception:
            pass

        return Response({
            'success': True,
            'activation_code': code,
            'activation_expires_at': code_obj.expires_at.isoformat(),
        })


# ── Stage Advance / Return Views ──────────────────────────────────────────────

class StaffStageAdvanceView(APIView):
    """
    POST /api/staff/<id>/stage/advance/
    Advances staff from Trainee -> Probation or Probation -> Active.
    Allowed only when every active requirement for that gate is verified or waived.
    Admin / super_admin only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor_role = get_user_role(request.user)
        if actor_role not in ('super_admin', 'admin') and not getattr(request.user, 'is_superuser', False):
            return Response({'error': 'Only administrators can advance staff lifecycle stages.'}, status=status.HTTP_403_FORBIDDEN)

        staff = get_object_or_404(StaffMember, pk=pk)
        current_stage = staff.lifecycle_stage

        if current_stage == 'trainee':
            target_stage = 'probation'
            gate = 'trainee_to_probation'
        elif current_stage == 'probation':
            target_stage = 'active'
            gate = 'probation_to_active'
        elif current_stage == 'active':
            return Response({'error': 'Staff member is already an Active Employee.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({'error': 'Staff member lifecycle stage is Not reviewed (legacy active status).'}, status=status.HTTP_400_BAD_REQUEST)

        # Check all active requirements for this gate
        reqs = staff.requirements.filter(requirement_type__gate=gate, requirement_type__is_active=True).select_related('requirement_type')
        if not reqs.exists():
            return Response({'error': f'No active requirements configured for gate {gate}.'}, status=status.HTTP_400_BAD_REQUEST)

        missing = []
        for r in reqs:
            if r.status not in ('verified', 'waived'):
                missing.append(r.requirement_type.label)
            elif r.status == 'verified' and r.requirement_type.kind == 'document' and r.requirement_type.required_count > 1:
                cur_docs = r.documents.filter(is_current=True).count()
                if cur_docs < r.requirement_type.required_count:
                    missing.append(f"{r.requirement_type.label} ({cur_docs}/{r.requirement_type.required_count} uploaded)")

        if missing:
            return Response({
                'error': f"Cannot advance to {target_stage.title()}. The following requirements are incomplete:",
                'missing_requirements': missing,
            }, status=status.HTTP_400_BAD_REQUEST)

        note = request.data.get('note', '').strip()

        # Execute stage transition
        now = timezone.now()
        if target_stage == 'probation':
            staff.lifecycle_stage = StaffMember.LifecycleStage.PROBATION
            staff.probation_started_at = now
            prob_days = getattr(settings, 'STAFF_PROBATION_DEFAULT_DAYS', 90)
            staff.probation_end_date = (now + datetime.timedelta(days=prob_days)).date()
            staff.save(update_fields=['lifecycle_stage', 'probation_started_at', 'probation_end_date'])
        elif target_stage == 'active':
            staff.lifecycle_stage = StaffMember.LifecycleStage.ACTIVE
            staff.active_since = now
            staff.save(update_fields=['lifecycle_stage', 'active_since'])

        # Record append-only stage event
        StaffStageEvent.objects.create(
            staff=staff,
            from_stage=current_stage,
            to_stage=target_stage,
            decided_by=request.user,
            note=note,
        )

        try:
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.username,
                action=f'Advanced Staff to {target_stage.title()}',
                target_user=staff.user.username if staff.user else '',
                details=f"Advanced staff {staff.full_name} from {current_stage} to {target_stage}. Note: {note}",
            )
        except Exception:
            pass

        return Response({
            'success': True,
            'message': f'Staff member successfully advanced to {target_stage.title()}.',
            'lifecycle_stage': staff.lifecycle_stage,
            'lifecycle_stage_display': staff.get_lifecycle_stage_display(),
        })


class StaffStageReturnView(APIView):
    """
    POST /api/staff/<id>/stage/return/
    Returns staff to the preceding stage (Active -> Probation, or Probation -> Trainee).
    Mandatory reason required. Admin / super_admin only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor_role = get_user_role(request.user)
        if actor_role not in ('super_admin', 'admin') and not getattr(request.user, 'is_superuser', False):
            return Response({'error': 'Only administrators can return staff lifecycle stages.'}, status=status.HTTP_403_FORBIDDEN)

        reason = str(request.data.get('reason') or '').strip()
        if not reason:
            return Response({'error': 'A return reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        staff = get_object_or_404(StaffMember, pk=pk)
        current_stage = staff.lifecycle_stage

        if current_stage == 'active':
            target_stage = 'probation'
        elif current_stage == 'probation':
            target_stage = 'trainee'
        elif current_stage == 'trainee':
            return Response({'error': 'Staff member is already at Trainee stage.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({'error': 'Staff member lifecycle stage is Not reviewed.'}, status=status.HTTP_400_BAD_REQUEST)

        staff.lifecycle_stage = target_stage
        staff.save(update_fields=['lifecycle_stage'])

        # Record append-only stage event
        StaffStageEvent.objects.create(
            staff=staff,
            from_stage=current_stage,
            to_stage=target_stage,
            decided_by=request.user,
            note=reason,
        )

        try:
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.username,
                action=f'Returned Staff to {target_stage.title()}',
                target_user=staff.user.username if staff.user else '',
                details=f"Returned staff {staff.full_name} from {current_stage} to {target_stage}. Reason: {reason}",
            )
        except Exception:
            pass

        return Response({
            'success': True,
            'message': f'Staff member returned to {target_stage.title()}.',
            'lifecycle_stage': staff.lifecycle_stage,
            'lifecycle_stage_display': staff.get_lifecycle_stage_display(),
        })


# ── Requirement Actions ───────────────────────────────────────────────────────

class StaffRequirementUploadView(APIView):
    """
    POST /api/staff/requirements/<id>/upload/
    Uploads a document for a requirement.
    Allowed for admin, super_admin, or the staff member themself.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        requirement = get_object_or_404(StaffRequirement, pk=pk)
        staff = requirement.staff
        actor = request.user
        actor_role = get_user_role(actor)
        is_sa_or_admin = (actor_role in ('super_admin', 'admin')) or getattr(actor, 'is_superuser', False)
        is_self = staff.user_id == actor.id

        if not (is_sa_or_admin or is_self):
            return Response({'error': 'You do not have permission to upload documents for this staff member.'}, status=status.HTTP_403_FORBIDDEN)

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file uploaded.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            content_type = _validate_document_file(file_obj)
        except DjangoValidationError as e:
            return Response({'error': str(e.message if hasattr(e, 'message') else e)}, status=status.HTTP_400_BAD_REQUEST)

        expiry_date = request.data.get('expiry_date') or None

        original_filename = file_obj.name
        stored_filename = f"{uuid.uuid4().hex}_{original_filename}"

        # Mark previous documents for this requirement as not current if required_count == 1
        if requirement.requirement_type.required_count == 1:
            requirement.documents.update(is_current=False)

        doc = StaffDocument.objects.create(
            requirement=requirement,
            file=file_obj,
            original_filename=original_filename,
            stored_filename=stored_filename,
            content_type=content_type,
            size=file_obj.size,
            uploaded_by=actor,
            expiry_date=expiry_date,
            is_current=True,
        )

        # Update requirement status to submitted if pending/rejected
        if requirement.status in ('pending', 'rejected'):
            requirement.status = StaffRequirement.Status.SUBMITTED
            requirement.save(update_fields=['status', 'updated_at'])

        try:
            AuditLog.objects.create(
                actor=actor,
                actor_name=actor.username,
                action='Uploaded Staff Document',
                target_user=staff.user.username if staff.user else '',
                details=f"Uploaded document '{original_filename}' for requirement '{requirement.requirement_type.label}'.",
            )
        except Exception:
            pass

        return Response(StaffDocumentSerializer(doc, context={'request': request}).data, status=status.HTTP_201_CREATED)


class StaffRequirementVerifyView(APIView):
    """
    POST /api/staff/requirements/<id>/verify/
    Verifies a requirement. Admin / super_admin only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor_role = get_user_role(request.user)
        if actor_role not in ('super_admin', 'admin') and not getattr(request.user, 'is_superuser', False):
            return Response({'error': 'Only administrators can verify requirements.'}, status=status.HTTP_403_FORBIDDEN)

        requirement = get_object_or_404(StaffRequirement, pk=pk)
        requirement.status = StaffRequirement.Status.VERIFIED
        requirement.verified_by = request.user
        requirement.verified_at = timezone.now()
        requirement.rejection_reason = ''
        requirement.save(update_fields=['status', 'verified_by', 'verified_at', 'rejection_reason', 'updated_at'])

        try:
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.username,
                action='Verified Staff Requirement',
                target_user=requirement.staff.user.username if requirement.staff.user else '',
                details=f"Verified requirement '{requirement.requirement_type.label}' for staff {requirement.staff.full_name}.",
            )
        except Exception:
            pass

        return Response(StaffRequirementSerializer(requirement, context={'request': request}).data)


class StaffRequirementRejectView(APIView):
    """
    POST /api/staff/requirements/<id>/reject/
    Rejects a requirement with mandatory reason. Admin / super_admin only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor_role = get_user_role(request.user)
        if actor_role not in ('super_admin', 'admin') and not getattr(request.user, 'is_superuser', False):
            return Response({'error': 'Only administrators can reject requirements.'}, status=status.HTTP_403_FORBIDDEN)

        reason = str(request.data.get('reason') or '').strip()
        if not reason:
            return Response({'error': 'A rejection reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        requirement = get_object_or_404(StaffRequirement, pk=pk)
        requirement.status = StaffRequirement.Status.REJECTED
        requirement.rejection_reason = reason
        requirement.save(update_fields=['status', 'rejection_reason', 'updated_at'])

        try:
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.username,
                action='Rejected Staff Requirement',
                target_user=requirement.staff.user.username if requirement.staff.user else '',
                details=f"Rejected requirement '{requirement.requirement_type.label}' for staff {requirement.staff.full_name}. Reason: {reason}",
            )
        except Exception:
            pass

        return Response(StaffRequirementSerializer(requirement, context={'request': request}).data)


class StaffRequirementWaiveView(APIView):
    """
    POST /api/staff/requirements/<id>/waive/
    Waives a requirement with mandatory reason. SUPER_ADMIN ONLY!
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor_role = get_user_role(request.user)
        is_sa = (actor_role == 'super_admin') or getattr(request.user, 'is_superuser', False)
        if not is_sa:
            return Response({'error': 'Only Super Administrators can waive requirements.'}, status=status.HTTP_403_FORBIDDEN)

        reason = str(request.data.get('reason') or '').strip()
        if not reason:
            return Response({'error': 'A waiver reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        requirement = get_object_or_404(StaffRequirement, pk=pk)
        requirement.status = StaffRequirement.Status.WAIVED
        requirement.waived_by = request.user
        requirement.waiver_reason = reason
        requirement.save(update_fields=['status', 'waived_by', 'waiver_reason', 'updated_at'])

        try:
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.username,
                action='Waived Staff Requirement',
                target_user=requirement.staff.user.username if requirement.staff.user else '',
                details=f"Waived requirement '{requirement.requirement_type.label}' for staff {requirement.staff.full_name}. Reason: {reason}",
            )
        except Exception:
            pass

        return Response(StaffRequirementSerializer(requirement, context={'request': request}).data)


class StaffRequirementAssessmentView(APIView):
    """
    POST /api/staff/requirements/<id>/record-assessment/
    Records training completion, exam result, or competency check. Admin / super_admin only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor_role = get_user_role(request.user)
        if actor_role not in ('super_admin', 'admin') and not getattr(request.user, 'is_superuser', False):
            return Response({'error': 'Only administrators can record assessments.'}, status=status.HTTP_403_FORBIDDEN)

        requirement = get_object_or_404(StaffRequirement, pk=pk)

        course_name = request.data.get('course_name', '')
        completed_date = request.data.get('completed_date') or None
        exam_result = request.data.get('exam_result', '')
        score = request.data.get('score') or None
        exam_date = request.data.get('exam_date') or None
        assessor = request.data.get('assessor', '')
        competency_passed = request.data.get('competency_passed')
        competency_date = request.data.get('competency_date') or None
        notes = request.data.get('notes', '')
        lms_assignment_id = request.data.get('lms_assignment') or None

        assessment = StaffAssessment.objects.create(
            requirement=requirement,
            course_name=course_name,
            completed_date=completed_date,
            exam_result=exam_result,
            score=score,
            exam_date=exam_date,
            assessor=assessor,
            competency_passed=competency_passed,
            competency_date=competency_date,
            notes=notes,
            lms_assignment_id=lms_assignment_id,
            created_by=request.user,
        )

        # Auto-verify if assessment passes
        should_verify = False
        if requirement.requirement_type.code == 'training_completion' and completed_date:
            should_verify = True
        elif requirement.requirement_type.code == 'exam_clearance' and exam_result == 'pass':
            should_verify = True
        elif requirement.requirement_type.code == 'competency_check' and competency_passed:
            should_verify = True

        if should_verify:
            requirement.status = StaffRequirement.Status.VERIFIED
            requirement.verified_by = request.user
            requirement.verified_at = timezone.now()
            requirement.rejection_reason = ''
            requirement.save(update_fields=['status', 'verified_by', 'verified_at', 'rejection_reason', 'updated_at'])

        try:
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.username,
                action='Recorded Staff Assessment',
                target_user=requirement.staff.user.username if requirement.staff.user else '',
                details=f"Recorded assessment for '{requirement.requirement_type.label}' on staff {requirement.staff.full_name}.",
            )
        except Exception:
            pass

        return Response(StaffRequirementSerializer(requirement, context={'request': request}).data)


class StaffRequirementFeedbackView(APIView):
    """
    POST /api/staff/requirements/<id>/add-feedback/
    Records management or patient_family feedback.
    Allowed for admin, super_admin, and care_manager.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        actor_role = get_user_role(request.user)
        is_allowed = (actor_role in ('super_admin', 'admin', 'care_manager')) or getattr(request.user, 'is_superuser', False)
        if not is_allowed:
            return Response({'error': 'You do not have permission to submit staff feedback.'}, status=status.HTTP_403_FORBIDDEN)

        requirement = get_object_or_404(StaffRequirement, pk=pk)
        if requirement.requirement_type.kind != 'feedback':
            return Response({'error': 'Feedback can only be recorded on feedback requirements.'}, status=status.HTTP_400_BAD_REQUEST)

        source = request.data.get('source')
        if source not in ('management', 'patient_family'):
            # Default from requirement type code if valid
            if requirement.requirement_type.code == 'feedback_management':
                source = 'management'
            elif requirement.requirement_type.code == 'feedback_family':
                source = 'patient_family'
            else:
                return Response({'error': 'Invalid feedback source. Must be management or patient_family.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rating = int(request.data.get('rating', 0))
            if not (1 <= rating <= 5):
                raise ValueError()
        except (ValueError, TypeError):
            return Response({'error': 'Rating must be an integer between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        comment = str(request.data.get('comment') or '').strip()
        if not comment:
            return Response({'error': 'Comment is required for feedback.'}, status=status.HTTP_400_BAD_REQUEST)

        patient_id = request.data.get('patient') or None

        StaffFeedback.objects.create(
            requirement=requirement,
            source=source,
            rating=rating,
            comment=comment,
            entered_by=request.user,
            patient_id=patient_id,
        )

        # Check threshold
        should_verify = False
        if requirement.requirement_type.code == 'feedback_management':
            min_fb = getattr(settings, 'STAFF_MIN_MANAGEMENT_FEEDBACK', 1)
            count = requirement.feedbacks.filter(source='management').count()
            if count >= min_fb:
                should_verify = True
        elif requirement.requirement_type.code == 'feedback_family':
            min_fb = getattr(settings, 'STAFF_MIN_FAMILY_FEEDBACK', 1)
            count = requirement.feedbacks.filter(source='patient_family').count()
            if count >= min_fb:
                should_verify = True

        if should_verify:
            requirement.status = StaffRequirement.Status.VERIFIED
            requirement.verified_by = request.user
            requirement.verified_at = timezone.now()
            requirement.rejection_reason = ''
            requirement.save(update_fields=['status', 'verified_by', 'verified_at', 'rejection_reason', 'updated_at'])

        try:
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.username,
                action='Recorded Staff Feedback',
                target_user=requirement.staff.user.username if requirement.staff.user else '',
                details=f"Recorded {source} feedback ({rating}/5) for staff {requirement.staff.full_name}.",
            )
        except Exception:
            pass

        return Response(StaffRequirementSerializer(requirement, context={'request': request}).data)


# ── Private Document Download View ───────────────────────────────────────────

class StaffDocumentDownloadView(APIView):
    """
    GET /api/staff/documents/<id>/download/
    Streams private file from storage.
    Enforces role restrictions:
    - Sensitive files (blood_tests, police_verification): super_admin, admin, or the staff member themself only.
    - Other files: super_admin, admin, or staff member themself.
    - Branch manager and all others get 403 Forbidden.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        doc = get_object_or_404(StaffDocument, pk=pk)
        requirement = doc.requirement
        staff = requirement.staff
        actor = request.user
        actor_role = get_user_role(actor)
        is_sa_or_admin = (actor_role in ('super_admin', 'admin')) or getattr(actor, 'is_superuser', False)
        is_self = staff.user_id == actor.id

        is_sensitive = requirement.requirement_type.code in ('blood_tests', 'police_verification')

        if is_sensitive:
            if not (is_sa_or_admin or is_self):
                return Response(
                    {'error': 'Sensitive document. Only administrators and the staff member may view this file.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        else:
            if not (is_sa_or_admin or is_self):
                return Response(
                    {'error': 'You do not have permission to download this document.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        if not doc.file or not doc.file.storage.exists(doc.file.name):
            raise Http404("Document file does not exist on storage.")

        try:
            AuditLog.objects.create(
                actor=actor,
                actor_name=actor.username,
                action='Downloaded Staff Document',
                target_user=staff.user.username if staff.user else '',
                details=f"Downloaded document '{doc.original_filename}' ({requirement.requirement_type.label}) for staff {staff.full_name}.",
            )
        except Exception:
            pass

        response = FileResponse(doc.file.open('rb'), content_type=doc.content_type)
        response['Content-Disposition'] = f'inline; filename="{doc.original_filename}"'
        return response

