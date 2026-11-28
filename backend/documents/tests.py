import datetime
import logging
import os
from decimal import Decimal
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.signing import SignatureExpired
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import AuditLog
from bookings.models import Booking, BookingStatus, ServiceType, ShiftDuration
from documents.models import Document
from lms.models import Course, CourseAssignment
from patients.models import Patient
from staff.models import StaffMember, StaffRole
from staff.pin_service import attempt_unlock_patient, decrypt_pin, ensure_pin_for_duty

User = get_user_model()

VALID_PDF_BYTES = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'
VALID_PNG_BYTES = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
VALID_JPEG_BYTES = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xd9'


def _make_staff(username, role, lifecycle_stage='active', is_superuser=False, is_staff=False):
    user = User.objects.create_user(
        username=username,
        password='password123',
        first_name=username.title(),
        last_name='User',
        is_staff=is_staff or is_superuser or role in ('admin', 'super_admin'),
        is_superuser=is_superuser,
    )
    staff = StaffMember.objects.create(
        user=user,
        first_name=user.first_name,
        last_name=user.last_name,
        role=role,
        employee_id=f"DOCEMP-{user.id}-{username[:6].upper()}",
        hire_date=datetime.date(2023, 1, 1),
        lifecycle_stage=lifecycle_stage,
        is_active=True,
    )
    return user, staff


def _make_patient(suffix='1', portal_user=None):
    return Patient.objects.create(
        first_name='Doc',
        last_name=f'Patient {suffix}',
        mr_number=f'DOC-MR-{suffix}',
        patient_code=f'DOC-PT-{suffix}',
        date_of_birth=datetime.date(1984, 5, 10),
        gender=Patient.Gender.FEMALE,
        address='10 Clinic Way',
        phone='+92-300-1110001',
        emergency_contact_name='Guardian',
        emergency_contact_phone='+92-300-1110002',
        emergency_contact_relation='Spouse',
        primary_diagnosis='Chronic care',
        portal_user=portal_user,
        is_active=True,
    )


def _pdf_file(name='doc.pdf', content=VALID_PDF_BYTES):
    return SimpleUploadedFile(name, content, content_type='application/pdf')


def _rows(res):
    data = res.json()
    return data.get('results', data) if isinstance(data, dict) else data


@pytest.mark.django_db
def test_document_role_matrix_across_owner_types_and_pin_switch():
    admin_user, _ = _make_staff('doc_admin', StaffRole.ADMIN, is_staff=True)
    doc_user, doc_staff = _make_staff('doc_md', StaffRole.DOCTOR)
    nurse_user, nurse_staff = _make_staff('doc_rn', StaffRole.NURSE)
    unassigned_nurse_user, _ = _make_staff('doc_rn_un', StaffRole.NURSE)
    trainee_user, trainee_staff = _make_staff('doc_trainee', StaffRole.NURSE, lifecycle_stage='trainee')
    acct_user, _ = _make_staff('doc_acct', StaffRole.ACCOUNTANT)
    crm_user, _ = _make_staff('doc_crm', StaffRole.CRM_EXECUTIVE)

    fam_own = User.objects.create_user(username='doc_fam_own', password='password123')
    fam_other = User.objects.create_user(username='doc_fam_other', password='password123')
    patient = _make_patient('mat1', portal_user=fam_own)
    other_patient = _make_patient('mat2', portal_user=fam_other)

    now = timezone.now()
    for s, svc in ((doc_staff, ServiceType.DOCTOR_CONSULTATION), (nurse_staff, ServiceType.NURSING)):
        Booking.objects.create(
            patient=patient,
            assigned_staff=s,
            service_type=svc,
            status=BookingStatus.ASSIGNED,
            scheduled_time=now,
            shift_duration=ShiftDuration.EIGHT_HOURS,
            address='Addr',
            amount=Decimal('0.00'),
        )
    pin_nurse, _ = ensure_pin_for_duty(nurse_staff, now - datetime.timedelta(hours=1), now + datetime.timedelta(hours=7))

    course = Course.objects.create(title='Infection Control')
    CourseAssignment.objects.create(course=course, staff=nurse_staff)

    doc_patient = Document.objects.create(title='Patient Report', file=_pdf_file('p.pdf'), category='Clinical', owner_type='patient', patient=patient)
    doc_staff = Document.objects.create(title='Nurse License', file=_pdf_file('s.pdf'), category='HR', owner_type='staff', staff=nurse_staff)
    doc_course = Document.objects.create(title='Course Syllabus', file=_pdf_file('c.pdf'), category='Training', owner_type='course', course=course)
    doc_general = Document.objects.create(title='SOP Policy', file=_pdf_file('g.pdf'), category='Compliance', owner_type='general')

    client = APIClient()

    # Admin sees all 4
    client.force_authenticate(user=admin_user)
    admin_ids = {r['id'] for r in _rows(client.get('/api/documents/'))}
    assert {doc_patient.id, doc_staff.id, doc_course.id, doc_general.id}.issubset(admin_ids)

    # Assigned doctor & nurse with PIN OFF -> can read patient doc; doctor cannot read nurse's staff/course doc
    with override_settings(PATIENT_FILE_PIN_REQUIRED=False):
        client.force_authenticate(user=doc_user)
        assert client.get(f'/api/documents/{doc_patient.id}/').status_code == 200
        assert client.get(f'/api/documents/{doc_staff.id}/').status_code in (403, 404)
        assert client.get(f'/api/documents/{doc_general.id}/').status_code == 200

        client.force_authenticate(user=nurse_user)
        assert client.get(f'/api/documents/{doc_patient.id}/').status_code == 200
        assert client.get(f'/api/documents/{doc_staff.id}/').status_code == 200
        assert client.get(f'/api/documents/{doc_course.id}/').status_code == 200

    # PIN ON -> locked assigned nurse blocked on patient doc until unlocked
    with override_settings(PATIENT_FILE_PIN_REQUIRED=True):
        client.force_authenticate(user=nurse_user)
        locked_res = client.get(f'/api/documents/{doc_patient.id}/')
        assert locked_res.status_code == 403
        assert locked_res.json()['code'] == 'patient_file_locked'
        assert doc_patient.id not in {r['id'] for r in _rows(client.get('/api/documents/'))}

        # After unlock -> 200
        attempt_unlock_patient(nurse_user, patient, decrypt_pin(pin_nurse.pin_encrypted), now=now)
        assert client.get(f'/api/documents/{doc_patient.id}/').status_code == 200
        assert doc_patient.id in {r['id'] for r in _rows(client.get('/api/documents/'))}

    # Unassigned nurse -> 404 on patient doc
    client.force_authenticate(user=unassigned_nurse_user)
    assert client.get(f'/api/documents/{doc_patient.id}/').status_code == 404

    # Trainee -> blocked on patient doc read & write (404/403)
    client.force_authenticate(user=trainee_user)
    assert client.get(f'/api/documents/{doc_patient.id}/').status_code in (403, 404)
    assert client.post('/api/documents/', {'title': 'Trainee', 'category': 'Clinical', 'owner_type': 'patient', 'patient': patient.id, 'file': _pdf_file('tr.pdf')}, format='multipart').status_code in (403, 404)

    # Family own patient -> 200; other patient -> 404
    client.force_authenticate(user=fam_own)
    assert client.get(f'/api/documents/{doc_patient.id}/').status_code == 200
    assert client.get(f'/api/documents/{doc_general.id}/').status_code in (403, 404)
    doc_other = Document.objects.create(title='Other Patient Doc', file=_pdf_file('op.pdf'), category='Clinical', owner_type='patient', patient=other_patient)
    assert client.get(f'/api/documents/{doc_other.id}/').status_code == 404

    # Accountant & CRM executive -> blocked from all documents
    for blocked_u in (acct_user, crm_user):
        client.force_authenticate(user=blocked_u)
        assert _rows(client.get('/api/documents/')) == []
        assert client.get(f'/api/documents/{doc_patient.id}/').status_code in (403, 404)
        assert client.get(f'/api/documents/{doc_general.id}/').status_code in (403, 404)


@pytest.mark.django_db
def test_archive_instead_of_delete_requires_admin_and_reason_and_preserves_file():
    admin_user, _ = _make_staff('doc_arch_admin', StaffRole.ADMIN, is_staff=True)
    nurse_user, nurse_staff = _make_staff('doc_arch_nurse', StaffRole.NURSE)
    doc = Document.objects.create(title='Archive Me', file=_pdf_file('arch.pdf'), category='HR', owner_type='staff', staff=nurse_staff)
    file_path = doc.file.path
    assert os.path.isfile(file_path)

    client = APIClient()
    # Non-admin cannot archive/delete
    client.force_authenticate(user=nurse_user)
    assert client.delete(f'/api/documents/{doc.id}/', {'reason': 'Nope'}, format='json').status_code == 403

    # Admin without reason -> 400
    client.force_authenticate(user=admin_user)
    assert client.delete(f'/api/documents/{doc.id}/').status_code == 400

    # Admin with reason -> soft archive (row & file remain intact, audit created)
    res = client.post(f'/api/documents/{doc.id}/archive/', {'reason': 'Superseded SOP'}, format='json')
    assert res.status_code == 200
    doc.refresh_from_db()
    assert doc.is_archived is True
    assert doc.archived_by_id == admin_user.id
    assert doc.archive_reason == 'Superseded SOP'
    assert os.path.isfile(file_path)
    assert AuditLog.objects.filter(action='Document Archived', target_user__icontains=f'Document #{doc.id}').exists()

    # Hidden from normal list, visible with ?archived=true
    assert doc.id not in {r['id'] for r in _rows(client.get('/api/documents/'))}
    assert doc.id in {r['id'] for r in _rows(client.get('/api/documents/?archived=true'))}


@pytest.mark.django_db
def test_signed_download_link_expiry_binding_and_legacy_token(caplog):
    admin_user, _ = _make_staff('doc_dl_admin', StaffRole.ADMIN, is_staff=True)
    nurse_user, nurse_staff = _make_staff('doc_dl_nurse', StaffRole.NURSE)
    other_nurse_user, _ = _make_staff('doc_dl_other', StaffRole.NURSE)
    doc1 = Document.objects.create(title='Doc 1', file=_pdf_file('d1.pdf'), category='HR', owner_type='staff', staff=nurse_staff)
    doc2 = Document.objects.create(title='Doc 2', file=_pdf_file('d2.pdf'), category='Compliance', owner_type='general')

    client = APIClient()
    client.force_authenticate(user=nurse_user)
    link_res = client.post(f'/api/documents/{doc1.id}/download-link/')
    assert link_res.status_code == 200
    signed_url = link_res.json()['url']
    parsed = urlparse(signed_url)
    dl_token = parse_qs(parsed.query)['dl'][0]

    # Signed link works for the requesting user (unauthenticated browser click)
    anon = APIClient()
    ok_res = anon.get(f'/api/documents/{doc1.id}/download/?dl={dl_token}')
    assert ok_res.status_code == 200
    ok_res.close()

    # Signed link rejected for wrong document
    assert anon.get(f'/api/documents/{doc2.id}/download/?dl={dl_token}').status_code == 403

    # Signed link rejected when presented by another authenticated user
    other_client = APIClient()
    other_client.force_authenticate(user=other_nurse_user)
    assert other_client.get(f'/api/documents/{doc1.id}/download/?dl={dl_token}').status_code == 403

    # Expired signed link rejected
    with patch('documents.access.DOCUMENT_LINK_SIGNER.unsign', side_effect=SignatureExpired('Expired')):
        assert anon.get(f'/api/documents/{doc1.id}/download/?dl={dl_token}').status_code == 403

    # Legacy ?token=<JWT> works when DOCUMENT_LEGACY_QUERY_TOKEN=True (logs deprecation warning without token value)
    raw_jwt = str(AccessToken.for_user(admin_user))
    with override_settings(DOCUMENT_LEGACY_QUERY_TOKEN=True):
        with caplog.at_level(logging.WARNING, logger='documents.views'):
            leg_res = anon.get(f'/api/documents/{doc1.id}/download/?token={raw_jwt}')
            assert leg_res.status_code == 200
            leg_res.close()
        assert any('Deprecated ?token=' in rec.message and raw_jwt not in rec.message for rec in caplog.records)

    # Legacy ?token=<JWT> rejected with 401 when DOCUMENT_LEGACY_QUERY_TOKEN=False
    with override_settings(DOCUMENT_LEGACY_QUERY_TOKEN=False):
        assert anon.get(f'/api/documents/{doc1.id}/download/?token={raw_jwt}').status_code == 401


@pytest.mark.django_db
def test_document_upload_validation_magic_bytes_size_and_mismatch():
    admin_user, _ = _make_staff('doc_up_admin', StaffRole.ADMIN, is_staff=True)
    client = APIClient()
    client.force_authenticate(user=admin_user)

    # Valid PDF succeeds
    ok_res = client.post('/api/documents/', {'title': 'Valid', 'category': 'Compliance', 'owner_type': 'general', 'file': _pdf_file('ok.pdf')}, format='multipart')
    assert ok_res.status_code == 201

    # Mismatched extension (.pdf containing PNG bytes) rejected
    bad_mismatch = SimpleUploadedFile('fake.pdf', VALID_PNG_BYTES, content_type='application/pdf')
    assert client.post('/api/documents/', {'title': 'Bad1', 'category': 'Compliance', 'owner_type': 'general', 'file': bad_mismatch}, format='multipart').status_code == 400

    # Unsupported content (plain text renamed .pdf) rejected
    bad_text = SimpleUploadedFile('script.pdf', b'hello not a pdf', content_type='application/pdf')
    assert client.post('/api/documents/', {'title': 'Bad2', 'category': 'Compliance', 'owner_type': 'general', 'file': bad_text}, format='multipart').status_code == 400

    # Oversized file rejected via STAFF_DOCUMENT_MAX_MB
    with override_settings(STAFF_DOCUMENT_MAX_MB=0):
        assert client.post('/api/documents/', {'title': 'Huge', 'category': 'Compliance', 'owner_type': 'general', 'file': _pdf_file('big.pdf')}, format='multipart').status_code == 400


@pytest.mark.django_db
def test_protected_media_routes_and_photo_lms_behavior():
    admin_user, _ = _make_staff('doc_med_admin', StaffRole.ADMIN, is_staff=True)
    nurse_user, nurse_staff = _make_staff('doc_med_nurse', StaffRole.NURSE)
    other_user, _ = _make_staff('doc_med_other', StaffRole.NURSE)

    nurse_staff.id_card_front = SimpleUploadedFile('cnic_front.png', VALID_PNG_BYTES, content_type='image/png')
    nurse_staff.photo = SimpleUploadedFile('avatar.jpg', VALID_JPEG_BYTES, content_type='image/jpeg')
    nurse_staff.save()

    doc_staff = Document.objects.create(title='Staff Doc', file=_pdf_file('media_staff.pdf'), category='HR', owner_type='staff', staff=nurse_staff)

    anon = APIClient()
    # Unauthenticated blocked on /media/documents/ and /media/staff_id_cards/
    assert anon.get(f'/media/{doc_staff.file.name}').status_code in (401, 403)
    assert anon.get(f'/media/{nurse_staff.id_card_front.name}').status_code in (401, 403)

    # Photo remains public
    photo_res = anon.get(f'/media/{nurse_staff.photo.name}')
    assert photo_res.status_code == 200
    photo_res.close()

    # Other nurse blocked on /media/documents/ and /media/staff_id_cards/
    other_client = APIClient()
    other_client.force_authenticate(user=other_user)
    assert other_client.get(f'/media/{doc_staff.file.name}').status_code in (403, 404)
    assert other_client.get(f'/media/{nurse_staff.id_card_front.name}').status_code == 403

    # Owning nurse and admin allowed
    for allowed_u in (nurse_user, admin_user):
        c = APIClient()
        c.force_authenticate(user=allowed_u)
        r1 = c.get(f'/media/{doc_staff.file.name}')
        assert r1.status_code == 200
        r1.close()
        r2 = c.get(f'/media/{nurse_staff.id_card_front.name}')
        assert r2.status_code == 200
        r2.close()
