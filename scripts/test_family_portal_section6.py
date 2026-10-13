import os
import sys
import django

# Setup Django environment
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework.test import APIClient
from patients.models import Patient
from accounts.models import UserProfile, UserRole

def test_family_portal():
    client = APIClient()

    # Create linked and unlinked users
    linked_user, _ = User.objects.get_or_create(username='test_fam_linked', defaults={'email': 'linked@example.com'})
    linked_user.set_password('Password123!')
    linked_user.save()
    UserProfile.objects.update_or_create(user=linked_user, defaults={'role': UserRole.PATIENT_FAMILY})

    unlinked_user, _ = User.objects.get_or_create(username='test_fam_unlinked', defaults={'email': 'unlinked@example.com'})
    unlinked_user.set_password('Password123!')
    unlinked_user.save()
    UserProfile.objects.update_or_create(user=unlinked_user, defaults={'role': UserRole.PATIENT_FAMILY})

    # Unlink any previous patients
    Patient.objects.filter(portal_user=linked_user).update(portal_user=None)
    Patient.objects.filter(portal_user=unlinked_user).update(portal_user=None)

    patient, _ = Patient.objects.get_or_create(
        mr_number='MR-FAM-001',
        defaults={'first_name': 'Test', 'last_name': 'Patient Linked', 'phone': '03001234567', 'date_of_birth': '1980-01-01', 'gender': 'male'}
    )
    patient.portal_user = linked_user
    patient.save()

    routes = [
        ('GET', '/api/portal/my/patient/'),
        ('GET', '/api/portal/my/patient_profile/'),
        ('GET', '/api/portal/my/visits/'),
        ('GET', '/api/portal/my/vitals/'),
        ('GET', '/api/portal/my/invoices/'),
        ('GET', '/api/portal/my/messages/'),
        ('POST', '/api/portal/my/messages/'),
    ]

    print("=== Testing Linked Family User ===")
    client.force_authenticate(user=linked_user)
    for method, path in routes:
        if method == 'GET':
            res = client.get(path)
        else:
            res = client.post(path, {'message': 'Hello care team'}, format='json')
        print(f"[{method}] {path} -> {res.status_code}")
        assert res.status_code in (200, 201), f"Linked user failed on {path}: {res.status_code} {res.data}"

    print("\n=== Testing Unlinked Family User ===")
    client.force_authenticate(user=unlinked_user)
    for method, path in routes:
        if method == 'GET':
            res = client.get(path)
        else:
            res = client.post(path, {'message': 'Hello care team'}, format='json')
        print(f"[{method}] {path} -> {res.status_code} ({res.data})")
        assert res.status_code == 404, f"Unlinked user did not return 404 on {path}: {res.status_code} {res.data}"
        assert 'No patient record is linked' in str(res.data)

    print("\n[PASS] All Family Portal linked and unlinked scenarios verified successfully with 0 500 errors!")

if __name__ == '__main__':
    test_family_portal()
