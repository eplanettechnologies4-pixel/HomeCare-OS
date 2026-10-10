import os
import sys
import django

# Setup Django environment
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.conf import settings
from django.core.cache import cache
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.models import User
from accounts.models import UserProfile, UserRole  # type: ignore
from staff.models import StaffMember  # type: ignore
from patients.models import Patient  # type: ignore
from bookings.models import Booking  # type: ignore
from crm.models import Lead  # type: ignore

def run_tests():
    print("=" * 70)
    print("RUNNING EXTENSIVE TEST SUITE FOR PUBLIC BOOKINGS & PORTAL SECURITY")
    print("=" * 70)

    client = APIClient()

    # -------------------------------------------------------------------------
    # 1. SETTINGS VERIFICATION: NUM_PROXIES and CACHES
    # -------------------------------------------------------------------------
    print("\n[Check 1] Verify REST_FRAMEWORK NUM_PROXIES & Cache Configuration:")
    num_proxies = settings.REST_FRAMEWORK.get('NUM_PROXIES')
    assert num_proxies == 1, f"Expected NUM_PROXIES=1, got {num_proxies}"
    print(f"  PASS: REST_FRAMEWORK['NUM_PROXIES'] = {num_proxies}")

    default_cache = settings.CACHES.get('default', {})
    cache_backend = default_cache.get('BACKEND')
    print(f"  PASS: CACHES['default']['BACKEND'] = {cache_backend}")

    # -------------------------------------------------------------------------
    # 2. VALIDATION: Missing Phone & Invalid Source
    # -------------------------------------------------------------------------
    print("\n[Check 2] POST /api/bookings/public/ - Basic input validation:")
    resp = client.post('/api/bookings/public/', {'patient_name': 'Test User'}, format='json')
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    print(f"  PASS: Missing phone rejected (HTTP 400): {resp.data}")

    resp = client.post('/api/bookings/public/', {
        'patient_name': 'Test User',
        'phone': '+923001112233',
        'source': 'malicious_source'
    }, format='json')
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    print(f"  PASS: Invalid source rejected (HTTP 400): {resp.data}")

    # -------------------------------------------------------------------------
    # 3. ANTI-BOT HONEYPOT
    # -------------------------------------------------------------------------
    print("\n[Check 3] POST /api/bookings/public/ - Honeypot anti-bot triggered:")
    resp = client.post('/api/bookings/public/', {
        'patient_name': 'Bot Spammer',
        'phone': '+923000000000',
        'honeypot': 'http://spam-link.com'
    }, format='json')
    assert resp.status_code == 201, f"Expected 201 fake success, got {resp.status_code}"
    assert not Patient.objects.filter(first_name='Bot').exists(), "Bot record must not be saved!"
    print(f"  PASS: Honeypot returns fake 201 without DB writes.")

    cache.clear()

    # -------------------------------------------------------------------------
    # 4. FILE VALIDATION: Size limit & Magic Byte Signatures
    # -------------------------------------------------------------------------
    print("\n[Check 4] File Upload Validation (Size & Binary Magic Signatures):")

    # 4a: File > 5 MB
    big_file = SimpleUploadedFile("large.pdf", b"%PDF-" + b"x" * (6 * 1024 * 1024), content_type="application/pdf")
    resp = client.post('/api/bookings/public/', {
        'patient_name': 'Large File User',
        'phone': '+923001112244',
        'prescription_file': big_file
    }, format='multipart')
    assert resp.status_code == 400, f"Expected 400 for file > 5MB, got {resp.status_code}"
    assert 'maximum allowed size' in str(resp.data).lower()
    print("  PASS: File > 5 MB rejected with 400.")

    # 4b: Extension .pdf but invalid signature (plain text content)
    fake_pdf = SimpleUploadedFile("fake.pdf", b"This is just a text file with pdf extension", content_type="application/pdf")
    resp = client.post('/api/bookings/public/', {
        'patient_name': 'Fake PDF User',
        'phone': '+923001112245',
        'prescription_file': fake_pdf
    }, format='multipart')
    assert resp.status_code == 400, f"Expected 400 for fake PDF magic signature, got {resp.status_code}"
    assert 'signature' in str(resp.data).lower() or 'invalid file' in str(resp.data).lower()
    print("  PASS: Fake PDF (invalid binary header) rejected with 400.")

    # 4c: Extension .jpg but invalid signature
    fake_jpg = SimpleUploadedFile("fake.jpg", b"NOT_A_JPEG_HEADER", content_type="image/jpeg")
    resp = client.post('/api/bookings/public/', {
        'patient_name': 'Fake JPG User',
        'phone': '+923001112246',
        'prescription_file': fake_jpg
    }, format='multipart')
    assert resp.status_code == 400, f"Expected 400 for fake JPG magic signature, got {resp.status_code}"
    print("  PASS: Fake JPG (invalid binary header) rejected with 400.")

    # 4d: Valid JPEG signature
    valid_jpg_content = b'\xff\xd8\xff\xe0\x00\x10JFIF' + b'\x00' * 32
    valid_jpg = SimpleUploadedFile("valid.jpg", valid_jpg_content, content_type="image/jpeg")
    resp = client.post('/api/bookings/public/', {
        'patient_name': 'Valid JPG User',
        'phone': '+923001112247',
        'prescription_file': valid_jpg
    }, format='multipart')
    assert resp.status_code == 201, f"Expected 201 for valid JPEG, got {resp.status_code}: {resp.data}"
    print("  PASS: Valid JPEG signature accepted (HTTP 201).")

    # 4e: Valid PNG signature
    valid_png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' + b'\x00' * 32
    valid_png = SimpleUploadedFile("valid.png", valid_png_content, content_type="image/png")
    resp = client.post('/api/bookings/public/', {
        'patient_name': 'Valid PNG User',
        'phone': '+923001112248',
        'prescription_file': valid_png
    }, format='multipart')
    assert resp.status_code == 201, f"Expected 201 for valid PNG, got {resp.status_code}: {resp.data}"
    print("  PASS: Valid PNG signature accepted (HTTP 201).")

    # 4f: Valid WEBP signature
    valid_webp_content = b'RIFF\x24\x00\x00\x00WEBPVP8 ' + b'\x00' * 32
    valid_webp = SimpleUploadedFile("valid.webp", valid_webp_content, content_type="image/webp")
    resp = client.post('/api/bookings/public/', {
        'patient_name': 'Valid WEBP User',
        'phone': '+923001112249',
        'prescription_file': valid_webp
    }, format='multipart')
    assert resp.status_code == 201, f"Expected 201 for valid WEBP, got {resp.status_code}: {resp.data}"
    print("  PASS: Valid WEBP signature accepted (HTTP 201).")

    cache.clear()

    # -------------------------------------------------------------------------
    # 5. DUAL-SOURCE API KEYS & SPOOFING PREVENTION
    # -------------------------------------------------------------------------
    print("\n[Check 5] Dual-Source API Keys (PUBLIC_BOOKING_API_KEY & MOBILE_PUBLIC_API_KEY):")
    # Configure both keys in environment
    os.environ['PUBLIC_BOOKING_API_KEY'] = 'secret_website_key_999'
    os.environ['MOBILE_PUBLIC_API_KEY'] = 'secret_mobile_key_888'

    # 5a: public_website without X-Public-Key -> 403
    resp = client.post('/api/bookings/public/', {
        'source': 'public_website',
        'patient_name': 'Website User 1',
        'phone': '+923005550001'
    }, format='json')
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.data}"
    print("  PASS: public_website without X-Public-Key rejected with HTTP 403.")

    # 5b: public_website with wrong key -> 403
    resp = client.post('/api/bookings/public/', {
        'source': 'public_website',
        'patient_name': 'Website User 2',
        'phone': '+923005550002'
    }, format='json', HTTP_X_PUBLIC_KEY='wrong_key')
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.data}"
    print("  PASS: public_website with wrong key rejected with HTTP 403.")

    # 5c: Bypass attempt: attacker claims source=public_mobile_app without mobile key -> 403!
    resp = client.post('/api/bookings/public/', {
        'source': 'public_mobile_app',
        'patient_name': 'Attacker Bypass',
        'phone': '+923005550003'
    }, format='json')
    assert resp.status_code == 403, f"Expected 403 for missing mobile key, got {resp.status_code}: {resp.data}"
    print("  PASS: Bypass attempt with source=public_mobile_app without mobile key rejected with HTTP 403.")

    # 5d: public_mobile_app with valid MOBILE_PUBLIC_API_KEY -> 201
    resp = client.post('/api/bookings/public/', {
        'source': 'public_mobile_app',
        'patient_name': 'Legit Mobile App User',
        'phone': '+923005550004'
    }, format='json', HTTP_X_PUBLIC_KEY='secret_mobile_key_888')
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.data}"
    print("  PASS: public_mobile_app with valid MOBILE_PUBLIC_API_KEY accepted (HTTP 201).")

    # 5e: public_website with valid PUBLIC_BOOKING_API_KEY -> 201
    valid_pdf_content = b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'
    valid_pdf = SimpleUploadedFile("rx.pdf", valid_pdf_content, content_type="application/pdf")
    resp = client.post('/api/bookings/public/', {
        'source': 'public_website',
        'patient_name': 'Tahir Mehmood',
        'phone': '+923005551234',
        'email': 'tahir@example.com',
        'gender': 'M',
        'date_of_birth': '1960-05-15',
        'address': 'House 14, Sector F-8/2, Islamabad',
        'service_type': 'general_nursing',
        'shift_duration': '8_hours',
        'shift_frequency': 'daily',
        'payment_method': 'cash_on_delivery',
        'prescription_file': valid_pdf
    }, format='multipart', HTTP_X_PUBLIC_KEY='secret_website_key_999')
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.data}"
    created_patient_id = resp.data['patient_id']
    created_booking_id = resp.data['booking_id']
    print("  PASS: public_website with valid PUBLIC_BOOKING_API_KEY accepted (HTTP 201).")

    # 5f: Skip check when env var is empty
    os.environ['PUBLIC_BOOKING_API_KEY'] = ''
    os.environ['MOBILE_PUBLIC_API_KEY'] = ''
    resp = client.post('/api/bookings/public/', {
        'source': 'public_website',
        'patient_name': 'Unsecured Dev User',
        'phone': '+923005559999'
    }, format='json')
    assert resp.status_code == 201, f"Expected 201 when env var is empty, got {resp.status_code}: {resp.data}"
    print("  PASS: When env vars are empty, key check is skipped (HTTP 201).")

    # -------------------------------------------------------------------------
    # 6. ROLE RESTRICTIONS ON PORTAL CREATION AND PASSWORD RESET
    # -------------------------------------------------------------------------
    print("\n[Check 6] Role-Based Access Control (RBAC) on Portal Management:")
    test_patient = Patient.objects.get(pk=created_patient_id)

    # Setup test users for each role:
    # Nurse user
    nurse_user, _ = User.objects.get_or_create(username='test_nurse_rbac')
    nurse_staff, _ = StaffMember.objects.get_or_create(
        user=nurse_user,
        defaults={
            'first_name': 'Test',
            'last_name': 'Nurse',
            'role': 'nurse',
            'phone': '+923001239901',
            'employee_id': 'EMP-TEST-NURSE',
            'hire_date': '2025-01-01'
        }
    )
    nurse_staff.role = 'nurse'
    nurse_staff.save()

    # Family user
    family_user, _ = User.objects.get_or_create(username='test_family_rbac')
    family_profile, _ = UserProfile.objects.get_or_create(
        user=family_user,
        defaults={'role': UserRole.PATIENT_FAMILY, 'status': 'active'}
    )
    family_profile.role = UserRole.PATIENT_FAMILY
    family_profile.save()

    # Care manager user
    care_manager_user, _ = User.objects.get_or_create(username='test_cm_rbac')
    cm_staff, _ = StaffMember.objects.get_or_create(
        user=care_manager_user,
        defaults={
            'first_name': 'Test',
            'last_name': 'CareManager',
            'role': 'care_manager',
            'phone': '+923001239902',
            'employee_id': 'EMP-TEST-CM',
            'hire_date': '2025-01-01'
        }
    )
    cm_staff.role = 'care_manager'
    cm_staff.save()

    # Admin user
    admin_user, _ = User.objects.get_or_create(username='test_admin_rbac', defaults={'is_staff': True})
    admin_user.is_staff = True
    admin_user.save()

    # 6a: Nurse attempts create_portal_user -> 403 Forbidden
    client.force_authenticate(user=nurse_user)
    resp = client.post(f'/api/patients/{test_patient.id}/create_portal_user/', {}, format='json')
    assert resp.status_code == 403, f"Nurse should be 403, got {resp.status_code}: {resp.data}"
    print(f"  PASS: Nurse blocked from create_portal_user (HTTP 403): {resp.data.get('detail')}")

    # 6b: Family user attempts create_portal_user -> 403 Forbidden
    client.force_authenticate(user=family_user)
    resp = client.post(f'/api/patients/{test_patient.id}/create_portal_user/', {}, format='json')
    assert resp.status_code == 403, f"Family user should be 403, got {resp.status_code}: {resp.data}"
    print(f"  PASS: Family user blocked from create_portal_user (HTTP 403): {resp.data.get('detail')}")

    # 6c: Care Manager creates portal user -> 201 Created
    client.force_authenticate(user=care_manager_user)
    resp = client.post(f'/api/patients/{test_patient.id}/create_portal_user/', {}, format='json')
    assert resp.status_code == 201, f"Care manager should be 201, got {resp.status_code}: {resp.data}"
    print(f"  PASS: Care Manager allowed to create portal user (HTTP 201): user '{resp.data.get('username')}'")

    # 6d: Nurse attempts reset_portal_password -> 403 Forbidden
    client.force_authenticate(user=nurse_user)
    resp = client.post(f'/api/patients/{test_patient.id}/reset_portal_password/', {}, format='json')
    assert resp.status_code == 403, f"Nurse should be 403, got {resp.status_code}: {resp.data}"
    print(f"  PASS: Nurse blocked from reset_portal_password (HTTP 403): {resp.data.get('detail')}")

    # 6e: Family user attempts reset_portal_password -> 403 Forbidden
    client.force_authenticate(user=family_user)
    resp = client.post(f'/api/patients/{test_patient.id}/reset_portal_password/', {}, format='json')
    assert resp.status_code == 403, f"Family user should be 403, got {resp.status_code}: {resp.data}"
    print(f"  PASS: Family user blocked from reset_portal_password (HTTP 403): {resp.data.get('detail')}")

    # 6f: Admin resets portal password -> 200 OK
    client.force_authenticate(user=admin_user)
    resp = client.post(f'/api/patients/{test_patient.id}/reset_portal_password/', {}, format='json')
    assert resp.status_code == 200, f"Admin should be 200, got {resp.status_code}: {resp.data}"
    print(f"  PASS: Admin allowed to reset portal password (HTTP 200): new password generated.")

    # -------------------------------------------------------------------------
    # 7. THROTTLE RATE ENFORCEMENT & PUBLIC_BOOKING_THROTTLE_RATE
    # -------------------------------------------------------------------------
    print("\n[Check 7] Rate Throttling & PUBLIC_BOOKING_THROTTLE_RATE:")
    client.force_authenticate(user=None)
    cache.clear()
    os.environ['PUBLIC_BOOKING_THROTTLE_RATE'] = '3/hour'
    for i in range(3):
        r = client.post('/api/bookings/public/', {'patient_name': f'Throttle User {i}', 'phone': f'+92300777000{i}'}, format='json')
        assert r.status_code == 201, f"Expected 201 on request {i+1}, got {r.status_code}: {r.data}"
    r_blocked = client.post('/api/bookings/public/', {'patient_name': 'Throttle User Blocked', 'phone': '+923007779999'}, format='json')
    assert r_blocked.status_code == 429, f"Expected 429 on 4th request, got {r_blocked.status_code}: {r_blocked.data}"
    print(f"  PASS: Rate throttle accurately enforced 3/hour and returned HTTP 429: {r_blocked.data.get('detail')}")

    # Reset throttle back to default
    os.environ['PUBLIC_BOOKING_THROTTLE_RATE'] = '10/hour'
    cache.clear()

    print("\n" + "=" * 70)
    print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY WITH 100% PASS RATE!")
    print("=" * 70)

if __name__ == '__main__':
    run_tests()
