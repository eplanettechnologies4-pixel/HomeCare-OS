import os
import sys
import django

# Setup django
sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework.test import APIClient
from patients.models import Patient
from accounts.models import UserProfile, UserRole
from datetime import date

print("=== Setting up test users ===")
# Clean up existing test users if any
User.objects.filter(username__in=['test_family_linked', 'test_family_unlinked']).delete()
Patient.objects.filter(mr_number='MR-TEST-9999').delete()

# Create linked family user
u_linked = User.objects.create_user(username='test_family_linked', email='linked@test.com', password='password123')
UserProfile.objects.create(user=u_linked, role=UserRole.PATIENT_FAMILY)

# Create patient linked to u_linked
p = Patient.objects.create(
    mr_number='MR-TEST-9999',
    first_name='Test',
    last_name='Patient',
    date_of_birth=date(1980, 1, 1),
    gender=Patient.Gender.MALE,
    phone='03001234567',
    address='123 Test St',
    portal_user=u_linked
)

# Create unlinked family user
u_unlinked = User.objects.create_user(username='test_family_unlinked', email='unlinked@test.com', password='password123')
UserProfile.objects.create(user=u_unlinked, role=UserRole.PATIENT_FAMILY)

print("Created u_linked (id=%d) linked to patient (id=%d)" % (u_linked.id, p.id))
print("Created u_unlinked (id=%d) unlinked" % u_unlinked.id)

client = APIClient()

portal_endpoints = [
    '/api/portal/my/patient_profile/',
    '/api/portal/my/patient/',
    '/api/portal/my/visits/',
    '/api/portal/my/vitals/',
    '/api/portal/my/invoices/',
    '/api/portal/my/messages/',
    '/api/accounts/dashboard/summary/',
    '/api/auth/me/',
]

print("\n=== Testing Linked Family User ===")
# Test login
login_res = client.post('/api/auth/login/', {'username': 'test_family_linked', 'password': 'password123'}, format='json')
print(f"Login status: {login_res.status_code}")
if login_res.status_code == 200:
    token = login_res.data['access']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    for ep in portal_endpoints:
        try:
            res = client.get(ep)
            print(f"GET {ep} -> {res.status_code}")
        except Exception as e:
            import traceback
            print(f"GET {ep} -> EXCEPTION: {e}")
            traceback.print_exc()

print("\n=== Testing Unlinked Family User ===")
client.credentials() # reset
login_res = client.post('/api/auth/login/', {'username': 'test_family_unlinked', 'password': 'password123'}, format='json')
print(f"Login status: {login_res.status_code}")
if login_res.status_code == 200:
    token = login_res.data['access']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    for ep in portal_endpoints:
        try:
            res = client.get(ep)
            print(f"GET {ep} -> {res.status_code}")
            if res.status_code >= 500:
                print(f"  Response content: {res.content}")
        except Exception as e:
            import traceback
            print(f"GET {ep} -> EXCEPTION: {e}")
            traceback.print_exc()
