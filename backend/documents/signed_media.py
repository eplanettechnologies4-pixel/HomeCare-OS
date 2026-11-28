import mimetypes
import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import FileResponse, Http404
from rest_framework import permissions, serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from homecareOS.permissions import get_user_role
from patients.scoping import check_clinician_patient_access

User = get_user_model()

CLINICAL_MEDIA_SIGNER = TimestampSigner(salt='clinical-media-url')

PROTECTED_CLINICAL_PREFIXES = (
    'prescriptions/',
    'labs/',
    'lab_reports/',
    'report_photos/',
    'patient_photos/',
    'certifications/',
)


def _get_max_age_seconds() -> int:
    return int(getattr(settings, 'MEDIA_SIGNED_URL_SECONDS', 600))


def normalize_media_rel_path(value) -> str:
    if not value:
        return ''
    name = getattr(value, 'name', None)
    if name is None:
        name = str(value)
    return str(name).replace('\\', '/').lstrip('/')


def sign_clinical_media_path(user_id: int, rel_path: str) -> str:
    clean = normalize_media_rel_path(rel_path)
    return CLINICAL_MEDIA_SIGNER.sign(f"{int(user_id)}:{clean}")


def verify_clinical_media_signature(token: str, expected_rel_path: str):
    clean_expected = normalize_media_rel_path(expected_rel_path)
    try:
        raw = CLINICAL_MEDIA_SIGNER.unsign(token, max_age=_get_max_age_seconds())
        user_id_str, signed_path = raw.split(':', 1)
        token_user_id = int(user_id_str)
    except SignatureExpired:
        return None, 'Signed media URL has expired.'
    except (BadSignature, ValueError):
        return None, 'Invalid signed media URL.'

    if normalize_media_rel_path(signed_path) != clean_expected:
        return None, 'Signed media URL does not match requested file.'
    return token_user_id, None


def build_signed_media_url(value, request=None, user=None):
    rel_path = normalize_media_rel_path(value)
    if not rel_path:
        return None
    u = user or (getattr(request, 'user', None) if request else None)
    if not u or not getattr(u, 'is_authenticated', False):
        return None
    sig = sign_clinical_media_path(u.id, rel_path)
    url = f"/media/{rel_path}?sig={sig}"
    if request:
        return request.build_absolute_uri(url)
    return url


class SignedMediaFileField(serializers.FileField):
    """
    Reusable DRF FileField that accepts normal uploads on write and returns a
    user- and path-bound signed URL on read (no DB query per URL).
    """

    def to_representation(self, value):
        if not value:
            return None
        return build_signed_media_url(
            value,
            request=self.context.get('request'),
            user=self.context.get('user'),
        )


def _is_admin(user) -> bool:
    return bool(getattr(user, 'is_superuser', False) or get_user_role(user) in ('super_admin', 'admin'))


def _check_patient_media_access(user, patient, *, allow_lab_tech=False, lab_order=None):
    if _is_admin(user):
        return True

    role = get_user_role(user)
    staff = getattr(user, 'staffmember', None)

    if allow_lab_tech:
        if role == 'lab_tech':
            return True
        if staff and staff.role in ('nurse', 'doctor') and getattr(staff, 'specialization', '') == 'Lab Technician':
            if lab_order is not None and lab_order.collection_staff_id == staff.id:
                return True

    if role in ('accountant', 'crm_executive'):
        raise PermissionDenied("Non-clinical roles cannot access patient clinical media.")

    is_family = role in ('patient_family', 'family') or (hasattr(user, 'patient_profile') and not staff)
    if is_family:
        if patient and patient.portal_user_id == user.id:
            return True
        raise Http404("Not found.")

    from patients.scoping import is_clinician_user
    if role not in ('care_manager', 'branch_manager') and not is_clinician_user(user):
        raise Http404("Not found.")

    if not patient:
        raise Http404("Not found.")

    check_clinician_patient_access(user, patient)
    return True


def _authorize_clinical_media_access(user, rel_path: str):
    if _is_admin(user):
        return True

    if rel_path.startswith('prescriptions/orders/'):
        from pharmacy.models import MedicineOrder
        order = MedicineOrder.objects.select_related('patient', 'delivery_staff').filter(prescription_file=rel_path).first()
        if not order:
            raise Http404("Not found.")
        staff = getattr(user, 'staffmember', None)
        if staff and order.delivery_staff_id == staff.id:
            return True
        return _check_patient_media_access(user, order.patient)

    if rel_path.startswith('prescriptions/'):
        from patients.models import Prescription
        from bookings.models import Booking
        rx = Prescription.objects.select_related('patient').filter(document=rel_path).first()
        if rx:
            return _check_patient_media_access(user, rx.patient)
        bk = Booking.objects.select_related('patient').filter(prescription_attachment=rel_path).first()
        if bk:
            return _check_patient_media_access(user, bk.patient)
        raise Http404("Not found.")

    if rel_path.startswith('labs/'):
        from patients.models import LabResult
        lr = LabResult.objects.select_related('patient').filter(document=rel_path).first()
        if not lr:
            raise Http404("Not found.")
        return _check_patient_media_access(user, lr.patient, allow_lab_tech=True)

    if rel_path.startswith('lab_reports/'):
        from lab.models import LabReport
        rep = LabReport.objects.select_related('lab_order__patient', 'lab_order__collection_staff').filter(result_file=rel_path).first()
        if not rep:
            raise Http404("Not found.")
        return _check_patient_media_access(user, rep.lab_order.patient, allow_lab_tech=True, lab_order=rep.lab_order)

    if rel_path.startswith('report_photos/'):
        from patients.models import ReportPhoto
        rp = ReportPhoto.objects.filter(image=rel_path).first()
        dr = rp.daily_reports.select_related('patient').first() if rp else None
        if not dr:
            raise Http404("Not found.")
        return _check_patient_media_access(user, dr.patient)

    if rel_path.startswith('patient_photos/'):
        from patients.models import Patient
        pt = Patient.objects.filter(photo=rel_path).first()
        if not pt:
            raise Http404("Not found.")
        return _check_patient_media_access(user, pt)

    if rel_path.startswith('certifications/'):
        from staff.models import Certification
        cert = Certification.objects.select_related('staff').filter(document=rel_path).first()
        if not cert:
            raise Http404("Not found.")
        staff = getattr(user, 'staffmember', None)
        if staff and cert.staff_id == staff.id:
            return True
        raise PermissionDenied("You do not have permission to view this certification.")

    raise PermissionDenied("Access denied.")


class ProtectedClinicalMediaView(APIView):
    """
    Authenticated/signed media route for clinical media prefixes:
      prescriptions/ (including prescriptions/orders/), labs/, lab_reports/,
      report_photos/, patient_photos/, certifications/.
    Never reveals file existence before authentication/signature validation.
    """
    permission_classes = [permissions.AllowAny]
    prefix = ''

    def get(self, request, filepath):
        clean_prefix = normalize_media_rel_path(self.prefix).rstrip('/')
        clean_subpath = normalize_media_rel_path(filepath)
        rel_path = f"{clean_prefix}/{clean_subpath}"

        # Authenticate via ?sig= or Authorization header BEFORE touching disk
        sig_token = request.query_params.get('sig')
        user = None
        if sig_token:
            token_user_id, err = verify_clinical_media_signature(sig_token, rel_path)
            if err:
                return Response({'detail': err}, status=status.HTTP_403_FORBIDDEN)
            if request.user and request.user.is_authenticated and request.user.id != token_user_id:
                return Response({'detail': 'Signed media URL belongs to another user.'}, status=status.HTTP_403_FORBIDDEN)
            user = User.objects.filter(pk=token_user_id, is_active=True).first()
            if not user:
                return Response({'detail': 'User account is invalid or inactive.'}, status=status.HTTP_403_FORBIDDEN)
        elif request.user and request.user.is_authenticated:
            user = request.user
        else:
            return Response(
                {'detail': 'Authentication credentials or valid signed media URL required.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        base_dir = os.path.normpath(os.path.join(settings.MEDIA_ROOT, clean_prefix))
        target_path = os.path.normpath(os.path.join(base_dir, clean_subpath))
        if not (target_path == base_dir or target_path.startswith(base_dir + os.sep)):
            return Response({'detail': 'Invalid file path.'}, status=status.HTTP_400_BAD_REQUEST)

        _authorize_clinical_media_access(user, rel_path)

        if not os.path.isfile(target_path):
            raise Http404("File not found.")

        content_type, _ = mimetypes.guess_type(target_path)
        return FileResponse(open(target_path, 'rb'), content_type=content_type or 'application/octet-stream')
