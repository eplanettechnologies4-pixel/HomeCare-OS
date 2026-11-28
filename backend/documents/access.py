import os
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db.models import Q
from django.http import Http404
from rest_framework.exceptions import PermissionDenied

from homecareOS.clinician_permissions import enforce_clinical_write_permission
from homecareOS.permissions import get_user_role
from lms.media_views import is_lms_manager
from lms.models import CourseAssignment
from patients.scoping import (
    check_clinician_patient_access,
    get_assigned_patient_ids_for_clinician,
    is_clinician_user,
)
from staff.lifecycle_views import _validate_document_file
from staff.pin_service import is_patient_unlocked_for_user

DOCUMENT_LINK_SIGNER = TimestampSigner(salt='document-download-link')
DOCUMENT_LINK_MAX_AGE_SECONDS = 60

DOC_MIME_TO_EXTS = {
    'application/pdf': {'pdf'},
    'image/jpeg': {'jpg', 'jpeg'},
    'image/png': {'png'},
}


def is_document_admin(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return get_user_role(user) in ('admin', 'super_admin')


def validate_uploaded_document_file(uploaded_file) -> str:
    """
    Reuse staff-document magic-byte + size validator and also reject files whose
    extension does not match the detected magic bytes.
    """
    detected_mime = _validate_document_file(uploaded_file)
    ext = os.path.splitext(getattr(uploaded_file, 'name', '') or '')[1].lower().lstrip('.')
    expected_exts = DOC_MIME_TO_EXTS.get(detected_mime, set())
    if ext not in expected_exts:
        raise DjangoValidationError(
            f"File extension '.{ext}' does not match detected content type ({detected_mime})."
        )
    return ext


def sign_document_download_token(user_id: int, document_id: int) -> str:
    return DOCUMENT_LINK_SIGNER.sign(f"{int(user_id)}:{int(document_id)}")


def verify_document_download_token(token: str, expected_document_id: int):
    """
    Verify signed ?dl= token: 60s expiry, bound to user_id and document_id.
    Returns (user_id, error_detail_or_None).
    """
    try:
        raw = DOCUMENT_LINK_SIGNER.unsign(token, max_age=DOCUMENT_LINK_MAX_AGE_SECONDS)
        user_id_str, doc_id_str = raw.split(':', 1)
        token_user_id = int(user_id_str)
        token_doc_id = int(doc_id_str)
    except SignatureExpired:
        return None, 'Download link has expired.'
    except (BadSignature, ValueError):
        return None, 'Invalid download link.'

    if token_doc_id != int(expected_document_id):
        return None, 'Download link is not valid for this document.'
    return token_user_id, None


def filter_documents_queryset_for_user(qs, user, include_archived=False):
    if not user or not user.is_authenticated:
        return qs.none()

    if is_document_admin(user):
        if include_archived == 'all':
            return qs
        if include_archived == 'true':
            return qs.filter(is_archived=True)
        return qs.filter(is_archived=False)

    qs = qs.filter(is_archived=False)
    role = get_user_role(user)
    staff = getattr(user, 'staffmember', None)
    is_family = role in ('patient_family', 'family') or (
        hasattr(user, 'patient_profile') and not staff
    )

    if is_family:
        return qs.filter(owner_type='patient', patient__portal_user=user)

    if role in ('accountant', 'crm_executive'):
        return qs.none()

    if role == 'branch_manager':
        allowed_q = Q(owner_type='general') | Q(owner_type='course') | Q(owner_type='patient')
        if staff:
            allowed_q |= Q(owner_type='staff', staff=staff)
        return qs.filter(allowed_q)

    # Start with staff, course, and general scopes
    allowed_q = Q()
    if staff:
        allowed_q |= Q(owner_type='staff', staff=staff)
        assigned_course_ids = CourseAssignment.objects.filter(staff=staff).values_list('course_id', flat=True)
        if is_lms_manager(user):
            allowed_q |= Q(owner_type='course')
        else:
            allowed_q |= Q(owner_type='course', course_id__in=assigned_course_ids)
        allowed_q |= Q(owner_type='general')
    elif is_lms_manager(user):
        allowed_q |= Q(owner_type='course') | Q(owner_type='general')

    # Patient documents
    is_trainee = bool(staff and getattr(staff, 'lifecycle_stage', None) == 'trainee')
    if not is_trainee and (role == 'care_manager' or is_clinician_user(user)):
        assigned_pids = get_assigned_patient_ids_for_clinician(user)
        if assigned_pids is None:
            allowed_q |= Q(owner_type='patient')
        else:
            if getattr(settings, 'PATIENT_FILE_PIN_REQUIRED', False):
                assigned_pids = {
                    pid for pid in assigned_pids
                    if is_patient_unlocked_for_user(user, pid)[0]
                }
            if assigned_pids:
                allowed_q |= Q(owner_type='patient', patient_id__in=assigned_pids)

    if not allowed_q:
        return qs.none()
    return qs.filter(allowed_q)


def check_document_read_access(user, doc):
    """
    Enforce single-source access rules for reading/downloading `doc`.
    Raises Http404 / PermissionDenied (including PatientFileLocked) when unauthorized.
    """
    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentication credentials were not provided.")

    if is_document_admin(user):
        return True

    if doc.is_archived:
        raise Http404("Document not found.")

    role = get_user_role(user)
    staff = getattr(user, 'staffmember', None)
    is_family = role in ('patient_family', 'family') or (
        hasattr(user, 'patient_profile') and not staff
    )

    if role in ('accountant', 'crm_executive'):
        raise Http404("Document not found.")

    if is_family:
        if doc.owner_type == 'patient' and doc.patient and doc.patient.portal_user_id == user.id:
            return True
        raise Http404("Document not found.")

    if doc.owner_type == 'patient':
        if role in ('accountant', 'crm_executive', 'lab_tech'):
            raise Http404("Document not found.")
        if role not in ('care_manager', 'branch_manager') and not is_clinician_user(user):
            raise Http404("Document not found.")
        if not doc.patient_id:
            raise Http404("Document not found.")
        check_clinician_patient_access(user, doc.patient_id)
        return True

    if doc.owner_type == 'staff':
        if staff and doc.staff_id == staff.id:
            return True
        raise Http404("Document not found.")

    if doc.owner_type == 'course':
        if is_lms_manager(user):
            return True
        if staff and doc.course_id and CourseAssignment.objects.filter(course_id=doc.course_id, staff=staff).exists():
            return True
        raise PermissionDenied("You are not assigned to this course.")

    if doc.owner_type == 'general':
        if staff or role in ('branch_manager', 'care_manager'):
            return True
        raise PermissionDenied("Authenticated staff access required.")

    raise Http404("Document not found.")


def check_document_write_access(user, owner_type, patient=None):
    """Enforce create/update permissions by Document owner_type."""
    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentication credentials were not provided.")

    if is_document_admin(user):
        return True

    if owner_type != 'patient':
        raise PermissionDenied("Only administrators may create or modify non-patient documents.")

    if not patient:
        raise PermissionDenied("Patient document must reference a patient.")

    check_clinician_patient_access(user, patient)
    enforce_clinical_write_permission(user, 'patient_documents', patient=patient)
    return True

