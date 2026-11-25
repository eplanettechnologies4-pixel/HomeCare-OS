import os
import io
import datetime
import pytest
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.models import User
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient

from staff.models import (
    StaffMember, StaffRole, StaffRequirementType, StaffRequirement,
    StaffDocument, StaffAssessment, StaffFeedback, StaffStageEvent,
    StaffActivationCode
)
from homecareOS.clinician_permissions import check_clinical_write_permission
from accounts.models import AuditLog
from bookings.models import Booking, BookingStatus
from patients.models import (
    Patient, Prescription, VitalSign, NurseNote, DoctorNote,
    PhysioNote, TherapyNote, LabResult, MARAdministration,
    ScheduledItem, ShiftHandoverNote
)
from lab.models import LabOrder, LabTest, LabOrderStatus


@pytest.fixture(autouse=True)
def override_private_media(tmp_path, monkeypatch):
    """Ensures test uploads are written to a temp folder, never touching real storage."""
    from django.conf import settings as dj_settings
    from django.core.files.storage import FileSystemStorage
    temp_dir = str(tmp_path / 'private_media')
    monkeypatch.setattr(dj_settings, 'PRIVATE_MEDIA_ROOT', temp_dir)
    from staff import models as staff_models
    temp_storage = FileSystemStorage(location=temp_dir, base_url=None)
    monkeypatch.setattr(staff_models.StaffDocument._meta.get_field('file'), 'storage', temp_storage)
    monkeypatch.setattr(staff_models, 'get_private_staff_storage', lambda: temp_storage)
    yield temp_dir


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def super_admin_user(db):
    user = User.objects.create_superuser('superadmin_test', 'sa@test.com', 'AdminPass123!')
    StaffMember.objects.create(user=user, role='super_admin', employee_id='EMP-SA-001', hire_date=datetime.date(2023, 1, 1))
    return user


@pytest.fixture
def admin_user(db):
    user = User.objects.create_user('admin_test', 'adm@test.com', 'AdminPass123!', is_staff=True)
    StaffMember.objects.create(user=user, role='admin', employee_id='EMP-ADM-001', hire_date=datetime.date(2023, 1, 1))
    return user


@pytest.fixture
def branch_manager_user(db):
    user = User.objects.create_user('bm_test', 'bm@test.com', 'Pass12345!', is_staff=True)
    StaffMember.objects.create(user=user, role='branch_manager', employee_id='EMP-BM-001', hire_date=datetime.date(2023, 1, 1))
    return user


@pytest.fixture
def care_manager_user(db):
    user = User.objects.create_user('cm_test', 'cm@test.com', 'Pass12345!')
    StaffMember.objects.create(user=user, role='care_manager', employee_id='EMP-CM-001', hire_date=datetime.date(2023, 1, 1))
    return user


@pytest.fixture
def doctor_user(db):
    user = User.objects.create_user('doc_test', 'doc@test.com', 'Pass12345!')
    StaffMember.objects.create(user=user, role='doctor', employee_id='EMP-DOC-001', hire_date=datetime.date(2023, 1, 1))
    return user


@pytest.fixture
def nurse_user(db):
    user = User.objects.create_user('nurse_test', 'nurse@test.com', 'Pass12345!')
    StaffMember.objects.create(user=user, role='nurse', employee_id='EMP-NUR-001', hire_date=datetime.date(2023, 1, 1))
    return user


# ── TEST 1: Requirement Seed Matches Specification ───────────────────────────

@pytest.mark.django_db
def test_requirement_seed_matches_specification():
    """
    Validates that the 14 requirements match the handwritten client requirements:
    - 9 trainee items (guardian_id count 2, police and blood test require expiry)
    - 3 probation items (training completion, exam clearance, competency check)
    - 2 feedback items (collected during probation for active gate)
    - Nothing crossed out under probation exists.
    """
    types = list(StaffRequirementType.objects.filter(is_active=True).order_by('gate', 'sort_order'))

    trainee_items = [t for t in types if t.gate == 'trainee_to_probation']
    assert len(trainee_items) == 9

    expected_trainee_codes = [
        'id_card_or_bform', 'qualifications', 'diploma_degree',
        'passport_photo', 'guardian_id', 'police_verification',
        'blood_tests', 'contract_employment', 'experience_letter'
    ]
    assert [t.code for t in trainee_items] == expected_trainee_codes

    guardian_id = StaffRequirementType.objects.get(code='guardian_id')
    assert guardian_id.required_count == 2

    police_verification = StaffRequirementType.objects.get(code='police_verification')
    assert police_verification.requires_expiry is True

    blood_tests = StaffRequirementType.objects.get(code='blood_tests')
    assert blood_tests.requires_expiry is True

    probation_items = [t for t in types if t.gate == 'probation_to_active']
    assert len(probation_items) == 5  # 3 assessments + 2 feedbacks

    assessment_items = [t for t in probation_items if t.kind == 'assessment']
    assert len(assessment_items) == 3
    assert [t.code for t in assessment_items] == ['training_completion', 'exam_clearance', 'competency_check']

    competency = StaffRequirementType.objects.get(code='competency_check')
    assert competency.label == 'Competency check'

    feedback_items = [t for t in probation_items if t.kind == 'feedback']
    assert len(feedback_items) == 2
    assert [t.code for t in feedback_items] == ['feedback_management', 'feedback_family']


# ── TEST 2: Creating Staff Makes Trainee with Unusable Password & Hashed Code ─

@pytest.mark.django_db
def test_create_staff_creates_trainee_with_unusable_password_and_hashed_code(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    res = api_client.post('/api/staff/members/', {
        'first_name': 'Ali',
        'last_name': 'Khan',
        'role': 'nurse',
        'phone': '03001234567',
        'email': 'ali.khan@test.com',
    })
    assert res.status_code == 201
    data = res.json()

    assert data['lifecycle_stage'] == 'trainee'
    assert 'activation_code' in data
    assert len(data['activation_code']) == 8
    code = data['activation_code']

    # User in database
    staff_member = StaffMember.objects.get(pk=data['id'])
    user = staff_member.user

    assert not user.has_usable_password()

    # Code stored hashed, NOT plaintext
    code_record = StaffActivationCode.objects.filter(staff=staff_member).first()
    assert code_record is not None
    assert code_record.code_hash != code
    assert check_password(code, code_record.code_hash)

    # 14 requirement rows created
    assert staff_member.requirements.count() == 14

    # Audit log recorded
    log = AuditLog.objects.filter(target_user=user.username, action='Created Staff Trainee').first()
    assert log is not None
    assert code not in log.details


# ── TEST 3: Role Escalation Protections ────────────────────────────────────────

@pytest.mark.django_db
def test_role_escalation_protection(api_client, admin_user, super_admin_user, nurse_user):
    # 1. Admin cannot create admin (requires super admin)
    api_client.force_authenticate(user=admin_user)
    res_admin = api_client.post('/api/staff/members/', {
        'first_name': 'Bad',
        'last_name': 'Admin',
        'role': 'admin',
    })
    assert res_admin.status_code == 403

    # Non-staff / Nurse cannot create any staff member
    api_client.force_authenticate(user=nurse_user)
    res_nurse_create = api_client.post('/api/staff/members/', {
        'first_name': 'New',
        'last_name': 'Staff',
        'role': 'nurse',
    })
    assert res_nurse_create.status_code == 403

    # Super admin CAN create admin
    api_client.force_authenticate(user=super_admin_user)
    res_ok = api_client.post('/api/staff/members/', {
        'first_name': 'Good',
        'last_name': 'Admin',
        'role': 'admin',
    })
    assert res_ok.status_code == 201


# ── TEST 4: Activation Flow (Success, Wrong Code, Lockout, Expired) ───────────

@pytest.mark.django_db
def test_activation_flow_success_and_errors(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    res = api_client.post('/api/staff/members/', {
        'first_name': 'Fatima',
        'last_name': 'Noor',
        'role': 'nurse',
    })
    data = res.json()
    username = data['username']
    code = data['activation_code']

    api_client.logout()

    generic_err = {'error': 'Invalid username or activation code.'}

    # 1. Unknown username returns generic error
    res_unknown = api_client.post('/api/auth/activate-staff/', {
        'username': 'unknown_user_99999',
        'code': 'ANYCODE1',
        'new_password': 'NewPassword123!',
    })
    assert res_unknown.status_code == 400
    assert res_unknown.json() == generic_err

    # 2. Wrong code returns generic error
    res_wrong = api_client.post('/api/auth/activate-staff/', {
        'username': username,
        'code': 'WRONGCOD',
        'new_password': 'NewPassword123!',
    })
    assert res_wrong.status_code == 400
    assert res_wrong.json() == generic_err

    # 3. Expired code returns generic error
    staff_member = StaffMember.objects.get(pk=data['id'])
    code_record = StaffActivationCode.objects.filter(staff=staff_member).first()
    code_record.expires_at = timezone.now() - datetime.timedelta(days=1)
    code_record.save(update_fields=['expires_at'])

    res_expired = api_client.post('/api/auth/activate-staff/', {
        'username': username,
        'code': code,
        'new_password': 'NewPassword123!',
    })
    assert res_expired.status_code == 400
    assert res_expired.json() == generic_err

    # Reset expiration for activation test
    code_record.expires_at = timezone.now() + datetime.timedelta(days=7)
    code_record.save(update_fields=['expires_at'])

    # 4. Weak password fails validation
    res_weak = api_client.post('/api/auth/activate-staff/', {
        'username': username,
        'code': code,
        'new_password': '123',
    })
    assert res_weak.status_code == 400

    # 5. Successful activation
    res_act = api_client.post('/api/auth/activate-staff/', {
        'username': username,
        'code': code,
        'new_password': 'SecretPassword123!',
    })
    assert res_act.status_code == 200

    # User can now log in
    user = User.objects.get(username=username)
    assert user.has_usable_password()
    assert user.check_password('SecretPassword123!')

    # 6. Reused / already-used code returns generic error
    res_reused = api_client.post('/api/auth/activate-staff/', {
        'username': username,
        'code': code,
        'new_password': 'AnotherPassword123!',
    })
    assert res_reused.status_code == 400
    assert res_reused.json() == generic_err

    # 7. Lockout after 5 wrong attempts
    code_obj = StaffActivationCode.objects.create(
        staff=staff_member,
        code_hash=make_password('LOCKCODE'),
        expires_at=timezone.now() + datetime.timedelta(days=7),
        attempts=5,
        locked_until=timezone.now() + datetime.timedelta(minutes=15),
    )
    res_lock = api_client.post('/api/auth/activate-staff/', {
        'username': username,
        'code': 'LOCKCODE',
        'new_password': 'NewPassword123!',
    })
    assert res_lock.status_code == 429


# ── TEST 5: Trainee Enforcement Blocks Bookings, Patients & Clinical Writes ───

@pytest.mark.django_db
def test_trainee_enforcement_blocks_assignments_and_clinical_writes(api_client, admin_user):
    # Create trainee nurse
    user_trainee = User.objects.create_user('trainee_nurse', 'tn@test.com', 'Pass12345!')
    trainee_staff = StaffMember.objects.create(
        user=user_trainee, role='nurse', lifecycle_stage='trainee', employee_id='EMP-TN-001',
        hire_date=datetime.date.today()
    )

    # 1. Trainee cannot author clinical entries
    allowed, msg = check_clinical_write_permission(user_trainee, 'vitals')
    assert allowed is False
    assert "trainee" in msg.lower()

    # 2. Trainee cannot be assigned to booking
    patient = Patient.objects.create(
        mr_number='MR-TR-001',
        first_name='Test',
        last_name='Patient',
        gender='M',
        date_of_birth=datetime.date(1980, 1, 1),
        address='Islamabad',
        primary_diagnosis='Observation'
    )
    api_client.force_authenticate(user=admin_user)

    res_booking = api_client.post('/api/bookings/', {
        'patient_id': patient.id,
        'service_type': 'nursing_care',
        'scheduled_time': timezone.now().isoformat(),
        'address': 'Islamabad F-8',
        'assigned_staff_id': trainee_staff.id,
    })
    assert res_booking.status_code == 400
    assert 'assigned_staff' in res_booking.json()

    # 3. Trainee cannot be assigned care manager on patient
    res_patient = api_client.post('/api/patients/', {
        'first_name': 'Jane',
        'last_name': 'Doe',
        'gender': 'F',
        'date_of_birth': '1990-01-01',
        'address': 'Islamabad F-8',
        'primary_diagnosis': 'Observation',
        'assigned_care_manager': trainee_staff.id,
    })
    assert res_patient.status_code == 400
    assert 'assigned_care_manager' in res_patient.json()

    # 4. Null "Not reviewed" staff keep current access
    user_legacy = User.objects.create_user('legacy_nurse', 'ln@test.com', 'Pass12345!')
    legacy_staff = StaffMember.objects.create(
        user=user_legacy, role='nurse', lifecycle_stage=None, employee_id='EMP-LN-001',
        hire_date=datetime.date.today()
    )
    allowed_legacy, _ = check_clinical_write_permission(user_legacy, 'vitals')
    assert allowed_legacy is True


# ── TEST 6: Regenerate Activation Code ────────────────────────────────────────

@pytest.mark.django_db
def test_regenerate_activation_code(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    res = api_client.post('/api/staff/members/', {
        'first_name': 'Sara',
        'last_name': 'Ahmed',
        'role': 'physio',
    })
    staff_id = res.json()['id']
    old_code = res.json()['activation_code']

    res_regen = api_client.post(f'/api/staff/members/{staff_id}/regenerate-code/')
    assert res_regen.status_code == 200
    new_code = res_regen.json()['activation_code']
    assert new_code != old_code

    # Old code is expired
    old_code_obj = StaffActivationCode.objects.filter(staff_id=staff_id).order_by('created_at').first()
    assert old_code_obj.expires_at <= timezone.now()


# ── TEST 7: Document Upload Validation, Private Serving & Sensitive Checks ────

@pytest.mark.django_db
def test_document_upload_validation_and_private_serving(api_client, admin_user, doctor_user):
    api_client.force_authenticate(user=admin_user)
    res = api_client.post('/api/staff/members/', {
        'first_name': 'Zain',
        'last_name': 'Malik',
        'role': 'nurse',
    })
    staff_id = res.json()['id']
    staff = StaffMember.objects.get(pk=staff_id)
    blood_req = staff.requirements.get(requirement_type__code='blood_tests')

    # Upload valid PDF
    pdf_bytes = b"%PDF-1.4 dummy pdf content here"
    valid_pdf = SimpleUploadedFile("blood_report.pdf", pdf_bytes, content_type="application/pdf")

    res_upload = api_client.post(f'/api/staff/requirements/{blood_req.id}/upload/', {
        'file': valid_pdf,
    }, format='multipart')
    assert res_upload.status_code == 201
    doc_id = res_upload.json()['id']

    # File stored in isolated temporary private storage, NOT touching real directory
    doc = StaffDocument.objects.get(pk=doc_id)
    assert doc.file.storage.location != os.path.join(str(settings.BASE_DIR), 'private_media')
    assert doc.file.storage.location == str(settings.PRIVATE_MEDIA_ROOT)

    # Sensitive download check: doctor cannot download blood test (sensitive)
    api_client.force_authenticate(user=doctor_user)
    res_doc_doc = api_client.get(f'/api/staff/documents/{doc_id}/download/')
    assert res_doc_doc.status_code == 403

    # Admin CAN download
    api_client.force_authenticate(user=admin_user)
    res_doc_adm = api_client.get(f'/api/staff/documents/{doc_id}/download/')
    assert res_doc_adm.status_code == 200
    assert res_doc_adm['Content-Type'] == 'application/pdf'

    # Invalid file type rejected
    fake_file = SimpleUploadedFile("bad.txt", b"Plain text not allowed", content_type="text/plain")
    res_bad = api_client.post(f'/api/staff/requirements/{blood_req.id}/upload/', {
        'file': fake_file,
    }, format='multipart')
    assert res_bad.status_code == 400


# ── TEST 8: Verify, Reject and Waive (Super Admin Only) ────────────────────────

@pytest.mark.django_db
def test_requirement_actions_verify_reject_waive(api_client, admin_user, super_admin_user):
    api_client.force_authenticate(user=admin_user)
    res = api_client.post('/api/staff/members/', {
        'first_name': 'Hamza',
        'last_name': 'Tariq',
        'role': 'speech',
    })
    staff_id = res.json()['id']
    staff = StaffMember.objects.get(pk=staff_id)
    exp_req = staff.requirements.get(requirement_type__code='experience_letter')

    # Admin rejects with reason
    res_rej_no_reason = api_client.post(f'/api/staff/requirements/{exp_req.id}/reject/', {})
    assert res_rej_no_reason.status_code == 400

    res_rej = api_client.post(f'/api/staff/requirements/{exp_req.id}/reject/', {
        'reason': 'Experience certificate missing stamp',
    })
    assert res_rej.status_code == 200
    exp_req.refresh_from_db()
    assert exp_req.status == 'rejected'
    assert exp_req.rejection_reason == 'Experience certificate missing stamp'

    # Admin CANNOT waive (Super Admin only)
    res_waive_admin = api_client.post(f'/api/staff/requirements/{exp_req.id}/waive/', {
        'reason': 'Fresh graduate exemption',
    })
    assert res_waive_admin.status_code == 403

    # Super Admin can waive with mandatory reason
    api_client.force_authenticate(user=super_admin_user)
    res_waive_sa = api_client.post(f'/api/staff/requirements/{exp_req.id}/waive/', {
        'reason': 'Fresh graduate exemption approved by CEO',
    })
    assert res_waive_sa.status_code == 200
    exp_req.refresh_from_db()
    assert exp_req.status == 'waived'
    assert exp_req.waived_by == super_admin_user


# ── TEST 9: Stage Advance Blocked until All Verified/Waived ───────────────────

@pytest.mark.django_db
def test_stage_advance_and_return(api_client, admin_user, super_admin_user, branch_manager_user):
    api_client.force_authenticate(user=admin_user)
    res = api_client.post('/api/staff/members/', {
        'first_name': 'Bilal',
        'last_name': 'Saeed',
        'role': 'physio',
    })
    staff_id = res.json()['id']
    staff = StaffMember.objects.get(pk=staff_id)

    # 1. Advance blocked with missing list
    res_adv_block = api_client.post(f'/api/staff/members/{staff_id}/stage/advance/')
    assert res_adv_block.status_code == 400
    assert len(res_adv_block.json()['missing_requirements']) > 0

    # 2. Branch manager cannot advance
    api_client.force_authenticate(user=branch_manager_user)
    res_adv_bm = api_client.post(f'/api/staff/members/{staff_id}/stage/advance/')
    assert res_adv_bm.status_code == 403

    # 3. Complete all trainee requirements (verify all except experience_letter which is waived)
    api_client.force_authenticate(user=admin_user)
    for r in staff.requirements.filter(requirement_type__gate='trainee_to_probation'):
        if r.requirement_type.code == 'guardian_id':
            # Guardian ID requires 2 documents
            for i in range(2):
                StaffDocument.objects.create(
                    requirement=r,
                    file=SimpleUploadedFile(f"gid_{i}.png", b"\x89PNG\r\n\x1a\nfake", content_type="image/png"),
                    original_filename=f"gid_{i}.png",
                    stored_filename=f"store_gid_{i}.png",
                    content_type="image/png",
                    size=100,
                    is_current=True,
                )
            r.status = 'verified'
            r.save()
        elif r.requirement_type.code == 'experience_letter':
            r.status = 'waived'
            r.waived_by = super_admin_user
            r.waiver_reason = 'Fresh graduate waiver'
            r.save()
        else:
            r.status = 'verified'
            r.save()

    # 4. Now advance to probation succeeds
    res_adv = api_client.post(f'/api/staff/members/{staff_id}/stage/advance/', {
        'note': 'All trainee documents cleared',
    })
    assert res_adv.status_code == 200
    staff.refresh_from_db()
    assert staff.lifecycle_stage == 'probation'
    assert staff.probation_started_at is not None
    assert staff.probation_end_date is not None

    # 5. Return to trainee requires reason
    res_ret_no_reason = api_client.post(f'/api/staff/members/{staff_id}/stage/return/', {})
    assert res_ret_no_reason.status_code == 400

    res_ret = api_client.post(f'/api/staff/members/{staff_id}/stage/return/', {
        'reason': 'Background check anomaly requires re-evaluation',
    })
    assert res_ret.status_code == 200
    staff.refresh_from_db()
    assert staff.lifecycle_stage == 'trainee'

    # 6. Stage history is recorded
    events = StaffStageEvent.objects.filter(staff=staff).order_by('decided_at')
    assert events.count() == 2
    assert events[0].from_stage == 'trainee' and events[0].to_stage == 'probation'
    assert events[1].from_stage == 'probation' and events[1].to_stage == 'trainee'

    # Cannot edit or delete stage event
    with pytest.raises(ValidationError):
        events[0].delete()


# ── TEST 10: Complete Permission Matrix (All Roles x All Lifecycle Actions) ──

@pytest.mark.django_db
def test_permission_matrix_all_roles_and_actions(
    api_client, super_admin_user, admin_user, branch_manager_user,
    care_manager_user, doctor_user
):
    """
    Validates the exact permission matrix for all lifecycle actions across:
    - super_admin
    - admin
    - branch_manager (onboarding status only, no downloads, no verify, no feedback)
    - care_manager (add feedback only, no documents, no onboarding status)
    - self (own checklist and own documents only)
    - other staff (403 on everything)
    """
    # 1. Create trainee target staff
    trainee_u = User.objects.create_user('trainee_subject', 'ts@test.com', 'Pass12345!')
    trainee_staff = StaffMember.objects.create(
        user=trainee_u, first_name='Trainee', last_name='Subject', role='nurse',
        lifecycle_stage='trainee', employee_id='EMP-TS-001', hire_date=datetime.date.today()
    )

    # Seed requirement records for trainee
    from staff.serializers import StaffCreateSerializer
    # Create 14 requirements
    for req_type in StaffRequirementType.objects.filter(is_active=True):
        StaffRequirement.objects.get_or_create(staff=trainee_staff, requirement_type=req_type)

    req_doc = trainee_staff.requirements.get(requirement_type__code='id_card_or_bform')
    req_exp = trainee_staff.requirements.get(requirement_type__code='experience_letter')
    req_assess = trainee_staff.requirements.get(requirement_type__code='training_completion')
    req_feedback = trainee_staff.requirements.get(requirement_type__code='feedback_management')

    # Upload an initial document
    doc = StaffDocument.objects.create(
        requirement=req_doc,
        file=SimpleUploadedFile("id_front.png", b"\x89PNG\r\n\x1a\nfake", content_type="image/png"),
        original_filename="id_front.png",
        stored_filename="store_id_front.png",
        content_type="image/png",
        size=100,
        uploaded_by=admin_user,
        is_current=True,
    )

    other_staff_u = doctor_user

    # Action 1: Onboarding Status (GET /api/staff/<id>/onboarding/)
    # super_admin: 200, admin: 200, branch_manager: 200 (read-only), care_manager: 403, self: 200, other: 403
    for u, expected in [(super_admin_user, 200), (admin_user, 200), (branch_manager_user, 200), (care_manager_user, 403), (trainee_u, 200), (other_staff_u, 403)]:
        api_client.force_authenticate(user=u)
        res = api_client.get(f'/api/staff/{trainee_staff.id}/onboarding/')
        assert res.status_code == expected, f"Onboarding status for {u.username} expected {expected}, got {res.status_code}"
        if res.status_code == 200 and u == branch_manager_user:
            # Branch manager must NOT receive document download URLs
            for req in res.json()['requirements']:
                for d in req.get('documents', []):
                    assert d.get('download_url') is None

    # Action 2: Document Download (GET /api/staff/documents/<id>/download/)
    # super_admin: 200, admin: 200, branch_manager: 403, care_manager: 403, self: 200, other: 403
    for u, expected in [(super_admin_user, 200), (admin_user, 200), (branch_manager_user, 403), (care_manager_user, 403), (trainee_u, 200), (other_staff_u, 403)]:
        api_client.force_authenticate(user=u)
        res = api_client.get(f'/api/staff/documents/{doc.id}/download/')
        assert res.status_code == expected, f"Document download for {u.username} expected {expected}, got {res.status_code}"

    # Action 3: Document Upload (POST /api/staff/requirements/<id>/upload/)
    # super_admin: 201, admin: 201, branch_manager: 403, care_manager: 403, self: 201, other: 403
    for u, expected in [(super_admin_user, 201), (admin_user, 201), (branch_manager_user, 403), (care_manager_user, 403), (trainee_u, 201), (other_staff_u, 403)]:
        api_client.force_authenticate(user=u)
        fake_f = SimpleUploadedFile(f"up_{u.username}.pdf", b"%PDF-1.4 sample", content_type="application/pdf")
        res = api_client.post(f'/api/staff/requirements/{req_doc.id}/upload/', {'file': fake_f}, format='multipart')
        assert res.status_code == expected, f"Document upload for {u.username} expected {expected}, got {res.status_code}"

    # Action 4: Verify Requirement (POST /api/staff/requirements/<id>/verify/)
    # super_admin: 200, admin: 200, branch_manager: 403, care_manager: 403, self: 403, other: 403
    for u, expected in [(super_admin_user, 200), (admin_user, 200), (branch_manager_user, 403), (care_manager_user, 403), (trainee_u, 403), (other_staff_u, 403)]:
        api_client.force_authenticate(user=u)
        res = api_client.post(f'/api/staff/requirements/{req_doc.id}/verify/')
        assert res.status_code == expected, f"Verify for {u.username} expected {expected}, got {res.status_code}"

    # Action 5: Reject Requirement (POST /api/staff/requirements/<id>/reject/)
    # super_admin: 200, admin: 200, branch_manager: 403, care_manager: 403, self: 403, other: 403
    for u, expected in [(super_admin_user, 200), (admin_user, 200), (branch_manager_user, 403), (care_manager_user, 403), (trainee_u, 403), (other_staff_u, 403)]:
        api_client.force_authenticate(user=u)
        res = api_client.post(f'/api/staff/requirements/{req_doc.id}/reject/', {'reason': 'Sample reject note'})
        assert res.status_code == expected, f"Reject for {u.username} expected {expected}, got {res.status_code}"

    # Action 6: Waive Requirement (POST /api/staff/requirements/<id>/waive/)
    # SUPER_ADMIN ONLY: 200. admin: 403, branch_manager: 403, care_manager: 403, self: 403, other: 403
    for u, expected in [(super_admin_user, 200), (admin_user, 403), (branch_manager_user, 403), (care_manager_user, 403), (trainee_u, 403), (other_staff_u, 403)]:
        api_client.force_authenticate(user=u)
        res = api_client.post(f'/api/staff/requirements/{req_exp.id}/waive/', {'reason': 'Waived by policy'})
        assert res.status_code == expected, f"Waive for {u.username} expected {expected}, got {res.status_code}"

    # Action 7: Record Assessment (POST /api/staff/requirements/<id>/record-assessment/)
    # super_admin: 200, admin: 200, branch_manager: 403, care_manager: 403, self: 403, other: 403
    for u, expected in [(super_admin_user, 200), (admin_user, 200), (branch_manager_user, 403), (care_manager_user, 403), (trainee_u, 403), (other_staff_u, 403)]:
        api_client.force_authenticate(user=u)
        res = api_client.post(f'/api/staff/requirements/{req_assess.id}/record-assessment/', {
            'course_name': 'Orientation',
            'completed_date': '2026-01-01',
        })
        assert res.status_code == expected, f"Record assessment for {u.username} expected {expected}, got {res.status_code}"

    # Action 8: Add Feedback (POST /api/staff/requirements/<id>/add-feedback/)
    # super_admin: 200, admin: 200, branch_manager: 403, care_manager: 200, self: 403, other: 403
    for u, expected in [(super_admin_user, 200), (admin_user, 200), (branch_manager_user, 403), (care_manager_user, 200), (trainee_u, 403), (other_staff_u, 403)]:
        api_client.force_authenticate(user=u)
        res = api_client.post(f'/api/staff/requirements/{req_feedback.id}/add-feedback/', {
            'source': 'management',
            'rating': 5,
            'comment': 'Excellent attitude and dedication',
        })
        assert res.status_code == expected, f"Add feedback for {u.username} expected {expected}, got {res.status_code}"

    # Action 9: Stage Advance (POST /api/staff/<id>/stage/advance/)
    # super_admin & admin: allowed (may return 400 for incomplete gate, never 403). others: 403
    for u, is_blocked in [(super_admin_user, False), (admin_user, False), (branch_manager_user, True), (care_manager_user, True), (trainee_u, True), (other_staff_u, True)]:
        api_client.force_authenticate(user=u)
        res = api_client.post(f'/api/staff/{trainee_staff.id}/stage/advance/')
        if is_blocked:
            assert res.status_code == 403, f"Stage advance for {u.username} expected 403, got {res.status_code}"
        else:
            assert res.status_code != 403, f"Stage advance for {u.username} should not be 403"

    # Action 10: Stage Return (POST /api/staff/<id>/stage/return/)
    # super_admin & admin: allowed (may return 400 for missing reason, never 403). others: 403
    for u, is_blocked in [(super_admin_user, False), (admin_user, False), (branch_manager_user, True), (care_manager_user, True), (trainee_u, True), (other_staff_u, True)]:
        api_client.force_authenticate(user=u)
        res = api_client.post(f'/api/staff/{trainee_staff.id}/stage/return/')
        if is_blocked:
            assert res.status_code == 403, f"Stage return for {u.username} expected 403, got {res.status_code}"
        else:
            assert res.status_code != 403, f"Stage return for {u.username} should not be 403"

    # Action 11: Regenerate Code (POST /api/staff/<id>/regenerate-code/)
    # super_admin: 200, admin: 200, branch_manager: 403, care_manager: 403, self: 403, other: 403
    for u, expected in [(super_admin_user, 200), (admin_user, 200), (branch_manager_user, 403), (care_manager_user, 403), (trainee_u, 403), (other_staff_u, 403)]:
        api_client.force_authenticate(user=u)
        res = api_client.post(f'/api/staff/{trainee_staff.id}/regenerate-code/')
        assert res.status_code == expected, f"Regenerate code for {u.username} expected {expected}, got {res.status_code}"


# ── TEST 11: Trainee Clinical Block (All 11 Routes) + Admin Authorship Block ─

@pytest.mark.django_db
def test_trainee_clinical_block_all_routes_and_admin_block(api_client, admin_user, super_admin_user):
    """
    Proves that:
    1. A trainee staff member gets 403 on ALL 11 clinical write routes:
       - vitals
       - intake/output
       - nurse notes
       - handover notes
       - MAR administration
       - prescription create (transcribed order)
       - doctor note
       - therapy and physio notes
       - lab specimen collect
       - scheduled-item completion
       - mark-entered-in-error
    2. Admin and super_admin get 403 on clinical authorship.
    3. Legacy staff (lifecycle_stage null) retains access.
    4. Trainee receives 0 patients on scoped patient endpoints.
    """
    now = timezone.now()

    # Patient
    patient = Patient.objects.create(
        mr_number='MR-CLIN-001',
        first_name='Tariq',
        last_name='Aziz',
        gender='M',
        date_of_birth=datetime.date(1975, 5, 10),
        address='Islamabad F-8',
        primary_diagnosis='Post-op care'
    )

    # 1. Trainee Nurse
    tn_user = User.objects.create_user('trainee_nurse_clin', 'tnc@test.com', 'Pass12345!')
    tn_staff = StaffMember.objects.create(
        user=tn_user, first_name='Trainee', last_name='Nurse', role='nurse',
        lifecycle_stage='trainee', employee_id='EMP-TNC-001', hire_date=datetime.date.today()
    )

    # 2. Trainee Doctor
    td_user = User.objects.create_user('trainee_doc_clin', 'tdc@test.com', 'Pass12345!')
    td_staff = StaffMember.objects.create(
        user=td_user, first_name='Trainee', last_name='Doctor', role='doctor',
        lifecycle_stage='trainee', employee_id='EMP-TDC-001', hire_date=datetime.date.today()
    )

    # 3. Trainee Physio
    tp_user = User.objects.create_user('trainee_physio_clin', 'tpc@test.com', 'Pass12345!')
    tp_staff = StaffMember.objects.create(
        user=tp_user, first_name='Trainee', last_name='Physio', role='physio',
        lifecycle_stage='trainee', employee_id='EMP-TPC-001', hire_date=datetime.date.today()
    )

    # 4. Legacy Active Nurse (lifecycle_stage = None)
    leg_nurse_u = User.objects.create_user('legacy_nurse_clin', 'lnc@test.com', 'Pass12345!')
    leg_nurse_s = StaffMember.objects.create(
        user=leg_nurse_u, first_name='Legacy', last_name='Nurse', role='nurse',
        lifecycle_stage=None, employee_id='EMP-LNC-001', hire_date=datetime.date(2022, 1, 1)
    )

    # Assign booking for legacy nurse
    Booking.objects.create(
        patient=patient, assigned_staff=leg_nurse_s, scheduled_time=now,
        status=BookingStatus.ASSIGNED, address='Islamabad F-8'
    )

    # Existing clinical items for testing updates / actions
    rx = Prescription.objects.create(
        patient=patient, medication='Amoxicillin 500mg', dosage='500mg', frequency='TDS',
        route='Oral', duration_days=7, date=now.date(), entry_mode='doctor',
        verification_status='verified', prescribed_by='Dr. Senior'
    )
    vital = VitalSign.objects.create(
        patient=patient, recorded_by=leg_nurse_s, blood_pressure_systolic=120, blood_pressure_diastolic=80,
        recorded_at=now
    )
    sched_item = ScheduledItem.objects.create(
        patient=patient, kind=ScheduledItem.Kind.PROCEDURE, title='Dressing Change',
        due_at=now + datetime.timedelta(hours=2), created_by=admin_user
    )
    lab_test = LabTest.objects.create(name='Serum Potassium', price=500)
    lab_order = LabOrder.objects.create(
        patient=patient, scheduled_collection_time=now, status=LabOrderStatus.REQUESTED,
        collection_staff=tn_staff
    )
    lab_order.tests.add(lab_test)

    # ── ROUTE 1: Vitals (POST /api/patients/<id>/vitals/)
    api_client.force_authenticate(user=tn_user)
    res_vit = api_client.post(f'/api/patients/{patient.id}/vitals/', {
        'blood_pressure_systolic': 120, 'blood_pressure_diastolic': 80, 'heart_rate': 72
    })
    assert res_vit.status_code == 403, f"Trainee vitals write expected 403, got {res_vit.status_code}"

    # ── ROUTE 2: Intake/Output (POST /api/patients/<id>/vitals/ with fluid balance)
    res_io = api_client.post(f'/api/patients/{patient.id}/vitals/', {
        'intake_ml': 500, 'output_ml': 450, 'notes': 'Fluid intake'
    })
    assert res_io.status_code == 403, f"Trainee intake/output expected 403, got {res_io.status_code}"

    # ── ROUTE 3: Nurse Notes (POST /api/patients/<id>/nurse-notes/)
    res_nn = api_client.post(f'/api/patients/{patient.id}/nurse-notes/', {
        'note': 'Routine nursing observation.'
    })
    assert res_nn.status_code == 403, f"Trainee nurse note expected 403, got {res_nn.status_code}"

    # ── ROUTE 4: Handover Notes (POST /api/staff-portal/handovers/)
    res_ho = api_client.post('/api/staff-portal/handovers/', {
        'patient_id': patient.id, 'text': 'Shift handover summary', 'shift_label': 'Morning'
    })
    assert res_ho.status_code == 403, f"Trainee handover expected 403, got {res_ho.status_code}"

    # ── ROUTE 5: MAR Administer (POST /api/patients/<id>/mar/administer/)
    res_mar = api_client.post(f'/api/patients/{patient.id}/mar/administer/', {
        'prescription_id': rx.id, 'status': 'given', 'notes': 'Given with water'
    })
    assert res_mar.status_code == 403, f"Trainee MAR administer expected 403, got {res_mar.status_code}"

    # ── ROUTE 6: Prescription Create (POST /api/prescriptions/)
    api_client.force_authenticate(user=td_user)
    res_rx = api_client.post('/api/prescriptions/', {
        'patient': patient.id, 'medication': 'Ciprofloxacin 500mg', 'dosage': '500mg',
        'frequency': 'BD', 'route': 'Oral', 'duration_days': 5, 'date': now.date().isoformat(),
        'entry_mode': 'transcribed', 'order_source': 'written', 'prescribed_by': 'Dr. External'
    })
    assert res_rx.status_code == 403, f"Trainee doctor prescription expected 403, got {res_rx.status_code}"

    # ── ROUTE 7: Doctor Note (POST /api/patients/<id>/doctor-notes/)
    res_dn = api_client.post(f'/api/patients/{patient.id}/doctor-notes/', {
        'note': 'Clinical impression and plan.'
    })
    assert res_dn.status_code == 403, f"Trainee doctor note expected 403, got {res_dn.status_code}"

    # ── ROUTE 8: Therapy and Physio Notes (POST /api/patients/<id>/therapy-notes/)
    api_client.force_authenticate(user=tp_user)
    res_tn = api_client.post(f'/api/patients/{patient.id}/therapy-notes/', {
        'discipline': 'physiotherapy', 'note': 'Gait training 30 mins.'
    })
    assert res_tn.status_code == 403, f"Trainee physio note expected 403, got {res_tn.status_code}"

    # ── ROUTE 9: Lab Specimen Collect (POST /api/lab/orders/<id>/collect-sample/)
    api_client.force_authenticate(user=tn_user)
    res_lab = api_client.post(f'/api/lab/orders/{lab_order.id}/collect-sample/', {
        'lat': 33.6844, 'lng': 73.0479, 'notes': 'Blood sample drawn'
    })
    assert res_lab.status_code == 403, f"Trainee lab specimen collect expected 403, got {res_lab.status_code}"

    # ── ROUTE 10: Scheduled-Item Completion (PATCH /api/patients/<id>/scheduled-items/<item_id>/)
    res_si = api_client.patch(f'/api/patients/{patient.id}/scheduled-items/{sched_item.id}/', {
        'status': 'done'
    })
    assert res_si.status_code == 403, f"Trainee scheduled item complete expected 403, got {res_si.status_code}"

    # ── ROUTE 11: Mark-Entered-in-Error (POST /api/patients/<id>/vitals/<item_id>/mark-entered-in-error/)
    res_err = api_client.post(f'/api/patients/{patient.id}/vitals/{vital.id}/mark-entered-in-error/', {
        'reason': 'Accidental duplicate entry'
    })
    assert res_err.status_code == 403, f"Trainee mark-entered-in-error expected 403, got {res_err.status_code}"

    # ── ADMIN & SUPER_ADMIN Authorship Block
    api_client.force_authenticate(user=admin_user)
    res_adm_vit = api_client.post(f'/api/patients/{patient.id}/vitals/', {
        'blood_pressure_systolic': 120, 'blood_pressure_diastolic': 80
    })
    assert res_adm_vit.status_code == 403, "Admin should get 403 on clinical vitals authorship"

    api_client.force_authenticate(user=super_admin_user)
    res_sa_doc = api_client.post(f'/api/patients/{patient.id}/doctor-notes/', {
        'note': 'Super admin attempting clinical write'
    })
    assert res_sa_doc.status_code == 403, "Super admin should get 403 on clinical doctor note authorship"

    # ── LEGACY STAFF (lifecycle_stage=None) KEEPS ACCESS
    api_client.force_authenticate(user=leg_nurse_u)
    res_leg_vit = api_client.post(f'/api/patients/{patient.id}/vitals/', {
        'blood_pressure_systolic': 118, 'blood_pressure_diastolic': 78, 'heart_rate': 74
    })
    assert res_leg_vit.status_code == 201, f"Legacy nurse should author vitals successfully, got {res_leg_vit.status_code}"

    # ── SCOPED PATIENT LIST ENDPOINTS RETURN NO PATIENTS FOR TRAINEE
    api_client.force_authenticate(user=tn_user)
    res_portal_pts = api_client.get('/api/staff-portal/patients/')
    assert res_portal_pts.status_code == 200
    assert res_portal_pts.json()['count'] == 0
    assert len(res_portal_pts.json()['results']) == 0

    res_pts = api_client.get('/api/patients/')
    assert res_pts.status_code == 200
    data_pts = res_pts.json()
    assert (len(data_pts) == 0) if isinstance(data_pts, list) else (data_pts.get('count', 0) == 0)

