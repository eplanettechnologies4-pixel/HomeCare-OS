import datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.signing import SignatureExpired
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking, BookingStatus, ServiceType, ShiftDuration
from documents.signed_media import (
    build_signed_media_url,
    sign_clinical_media_path,
    verify_clinical_media_signature,
)
from lab.models import LabOrder, LabOrderStatus, LabReport, LabTest
from patients.models import DailyReport, LabResult, Patient, Prescription, ReportPhoto
from pharmacy.models import MedicineOrder, MedicineOrderStatus
from staff.models import Certification, StaffMember, StaffRole
from staff.pin_service import attempt_unlock_patient, decrypt_pin, ensure_pin_for_duty

User = get_user_model()

VALID_PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'
VALID_PNG = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'


def _make_staff(username, role, is_superuser=False, is_staff=False):
    user = User.objects.create_user(
        username=username,
        password='password123',
        first_name=username.title(),
        last_name='Staff',
        is_staff=is_staff or is_superuser or role in ('admin', 'super_admin'),
        is_superuser=is_superuser,
    )
    staff = StaffMember.objects.create(
        user=user,
        first_name=user.first_name,
        last_name=user.last_name,
        role=role,
        employee_id=f"CM-{user.id}-{username[:6].upper()}",
        hire_date=datetime.date(2023, 1, 1),
        lifecycle_stage='active',
        is_active=True,
    )
    return user, staff


def _make_patient(suffix='1', portal_user=None):
    return Patient.objects.create(
        first_name='Media',
        last_name=f'Patient {suffix}',
        mr_number=f'MED-MR-{suffix}',
        patient_code=f'MED-PT-{suffix}',
        date_of_birth=datetime.date(1988, 3, 14),
        gender=Patient.Gender.MALE,
        address='22 Health Ave',
        phone='+92-300-2220001',
        emergency_contact_name='Guardian',
        emergency_contact_phone='+92-300-2220002',
        emergency_contact_relation='Brother',
        primary_diagnosis='Clinical observation',
        portal_user=portal_user,
        is_active=True,
    )


def _img(name):
    return SimpleUploadedFile(name, VALID_PNG, content_type='image/png')


def _pdf(name):
    return SimpleUploadedFile(name, VALID_PDF, content_type='application/pdf')


@pytest.mark.django_db
def test_signed_media_helper_roundtrip_expiry_tamper_wrong_user_and_path():
    user_a, _ = _make_staff('med_u1', StaffRole.NURSE)
    rel_path = 'prescriptions/rx_test.pdf'
    token = sign_clinical_media_path(user_a.id, rel_path)

    uid, err = verify_clinical_media_signature(token, rel_path)
    assert uid == user_a.id and err is None

    # Wrong path
    uid_wp, err_wp = verify_clinical_media_signature(token, 'prescriptions/other.pdf')
    assert uid_wp is None and err_wp is not None

    # Tampered token
    tampered = token[:-4] + ('XXXX' if not token.endswith('XXXX') else 'YYYY')
    uid_t, err_t = verify_clinical_media_signature(tampered, rel_path)
    assert uid_t is None and err_t is not None

    # Expired token
    with patch('documents.signed_media.CLINICAL_MEDIA_SIGNER.unsign', side_effect=SignatureExpired('expired')):
        uid_e, err_e = verify_clinical_media_signature(token, rel_path)
        assert uid_e is None and 'expired' in err_e.lower()

    # Does not reveal nonexistent file existence unauthenticated
    anon = APIClient()
    assert anon.get('/media/prescriptions/definitely_does_not_exist.pdf').status_code == 401


@pytest.mark.django_db
def test_protected_patient_clinical_media_prefixes_and_revocation():
    admin_user, _ = _make_staff('med_admin', StaffRole.ADMIN, is_staff=True)
    nurse_user, nurse = _make_staff('med_nurse', StaffRole.NURSE)
    unassigned_nurse_user, _ = _make_staff('med_unassigned', StaffRole.NURSE)
    lab_user, lab_staff = _make_staff('med_labtech', StaffRole.LAB_TECH)
    fam_own = User.objects.create_user(username='med_fam_own', password='password123')
    fam_other = User.objects.create_user(username='med_fam_other', password='password123')

    patient = _make_patient('m1', portal_user=fam_own)
    patient.photo = _img('avatar_m1.png')
    patient.save()

    now = timezone.now()
    bk = Booking.objects.create(
        patient=patient,
        assigned_staff=nurse,
        service_type=ServiceType.NURSING,
        status=BookingStatus.ASSIGNED,
        scheduled_time=now,
        shift_duration=ShiftDuration.EIGHT_HOURS,
        prescription_attachment=_pdf('bk_rx.pdf'),
        address='Addr',
        amount=Decimal('0.00'),
    )
    rx = Prescription.objects.create(
        patient=patient,
        booking=bk,
        date=timezone.localdate(),
        medication='Med A',
        dosage='5mg',
        frequency='OD',
        document=_pdf('rx_doc.pdf'),
    )
    med_order = MedicineOrder.objects.create(
        patient=patient,
        prescription_file=_pdf('order_rx.pdf'),
        delivery_address='Addr',
        status=MedicineOrderStatus.PENDING,
    )
    lab_result = LabResult.objects.create(
        patient=patient,
        test_name='CBC',
        result_value='Normal',
        collected_at=now,
        reported_at=now,
        document=_pdf('lr_doc.pdf'),
    )
    lab_test = LabTest.objects.create(name='Chem7', price=Decimal('500.00'))
    lab_order = LabOrder.objects.create(
        patient=patient,
        collection_staff=lab_staff,
        scheduled_collection_time=now,
        collection_address='Addr',
        status=LabOrderStatus.REPORT_READY,
    )
    lab_order.tests.add(lab_test)
    lab_report = LabReport.objects.create(lab_order=lab_order, result_file=_pdf('lab_rep.pdf'))
    daily_rep = DailyReport.objects.create(patient=patient, booking=bk, submitted_by=nurse, notes='OK')
    rep_photo = ReportPhoto.objects.create(image=_img('wound.png'))
    daily_rep.photos.add(rep_photo)

    pin_nurse, _ = ensure_pin_for_duty(nurse, now - datetime.timedelta(hours=1), now + datetime.timedelta(hours=7))

    # 1. Verify API serializer responses emit signed URLs (?sig=...) instead of plain /media/ URLs
    client = APIClient()
    client.force_authenticate(user=nurse_user)

    bk_data = client.get(f'/api/bookings/{bk.id}/').json()
    rx_data = client.get(f'/api/patients/prescriptions/{rx.id}/').json()
    lr_data = client.get(f'/api/patients/labs/{lab_result.id}/').json()
    pt_data = client.get(f'/api/patients/{patient.id}/').json()
    lab_order_data = client.get(f'/api/lab/orders/{lab_order.id}/').json()

    signed_bk_url = bk_data['prescription_attachment']
    signed_rx_url = rx_data['document']
    signed_lr_url = lr_data['document']
    signed_photo_url = pt_data['photo']
    signed_lab_rep_url = lab_order_data['reports'][0]['result_file']

    # Admin fetches medicine order & daily report photo signed URLs
    admin_client = APIClient()
    admin_client.force_authenticate(user=admin_user)
    mo_data = admin_client.get(f'/api/pharmacy/orders/{med_order.id}/').json()
    signed_mo_url = mo_data['prescription_file']
    signed_rp_url = build_signed_media_url(rep_photo.image, user=nurse_user)

    signed_urls = [
        signed_bk_url,
        signed_rx_url,
        signed_lr_url,
        signed_photo_url,
        signed_lab_rep_url,
        signed_mo_url,
        signed_rp_url,
    ]
    for u in signed_urls:
        assert u and '?sig=' in u

    # 2. Unauthenticated direct /media/... requests (without sig) are all refused (401)
    anon = APIClient()
    raw_paths = [
        bk.prescription_attachment.name,
        rx.document.name,
        med_order.prescription_file.name,
        lab_result.document.name,
        lab_report.result_file.name,
        rep_photo.image.name,
        patient.photo.name,
    ]
    for rp in raw_paths:
        assert anon.get(f'/media/{rp}').status_code == 401

    # 3. Signed URLs from API work for allowed nurse
    for u in (signed_bk_url, signed_rx_url, signed_lr_url, signed_photo_url, signed_lab_rep_url, signed_rp_url):
        res = anon.get(u)
        assert res.status_code == 200
        res.close()

    # 4. Signed URL belonging to nurse is rejected if another user sends Authorization header
    other_c = APIClient()
    other_c.force_authenticate(user=unassigned_nurse_user)
    assert other_c.get(signed_rx_url).status_code == 403

    # 5. Unassigned nurse cannot fetch with their own signature or header (404)
    assert other_c.get(f'/media/{rx.document.name}').status_code == 404

    # 6. Locked PIN with switch ON -> nurse's previously valid signed URL is now refused (403 patient_file_locked)
    with override_settings(PATIENT_FILE_PIN_REQUIRED=True):
        assert anon.get(signed_rx_url).status_code == 403
        assert anon.get(signed_lab_rep_url).status_code == 403

        # Unlock restores access
        attempt_unlock_patient(nurse_user, patient, decrypt_pin(pin_nurse.pin_encrypted), now=now)
        res_u = anon.get(signed_rx_url)
        assert res_u.status_code == 200
        res_u.close()

        # Removing assignment (cancelling booking) revokes PIN & refuses previously signed URL (404)
        bk.status = BookingStatus.CANCELLED
        bk.save(update_fields=['status'])
        assert anon.get(signed_rx_url).status_code == 404

    # 7. Family own vs other family
    fam_client = APIClient()
    fam_client.force_authenticate(user=fam_own)
    r_fam = fam_client.get(f'/media/{rx.document.name}')
    assert r_fam.status_code == 200
    r_fam.close()

    fam_other_c = APIClient()
    fam_other_c.force_authenticate(user=fam_other)
    assert fam_other_c.get(f'/media/{rx.document.name}').status_code == 404

    # 8. Lab tech can fetch lab_reports/ and labs/ even with PIN ON; admin can fetch all
    with override_settings(PATIENT_FILE_PIN_REQUIRED=True):
        lab_c = APIClient()
        lab_c.force_authenticate(user=lab_user)
        for lp in (lab_report.result_file.name, lab_result.document.name):
            rl = lab_c.get(f'/media/{lp}')
            assert rl.status_code == 200
            rl.close()

    for rp in raw_paths:
        ra = admin_client.get(f'/media/{rp}')
        assert ra.status_code == 200
        ra.close()


@pytest.mark.django_db
def test_certifications_signed_url_owner_and_admin_only():
    admin_user, _ = _make_staff('cert_admin', StaffRole.ADMIN, is_staff=True)
    nurse_user, nurse = _make_staff('cert_nurse', StaffRole.NURSE)
    other_user, _ = _make_staff('cert_other', StaffRole.NURSE)

    cert = Certification.objects.create(
        staff=nurse,
        name='BLS Card',
        issuing_body='AHA',
        issued_date=datetime.date(2024, 1, 1),
        document=_pdf('bls_cert.pdf'),
    )

    anon = APIClient()
    assert anon.get(f'/media/{cert.document.name}').status_code == 401

    nurse_c = APIClient()
    nurse_c.force_authenticate(user=nurse_user)
    profile_data = nurse_c.get(f'/api/staff/members/{nurse.id}/').json()
    cert_url = profile_data['certifications'][0]['document']
    assert '?sig=' in cert_url

    r_own = anon.get(cert_url)
    assert r_own.status_code == 200
    r_own.close()

    other_c = APIClient()
    other_c.force_authenticate(user=other_user)
    assert other_c.get(f'/media/{cert.document.name}').status_code == 403

    admin_c = APIClient()
    admin_c.force_authenticate(user=admin_user)
    r_adm = admin_c.get(f'/media/{cert.document.name}')
    assert r_adm.status_code == 200
    r_adm.close()
