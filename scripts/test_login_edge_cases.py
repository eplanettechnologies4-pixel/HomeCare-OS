import os
import sys
import django

sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework.test import APIClient
from patients.models import Patient
from accounts.models import UserProfile, UserRole

User.objects.filter(username__in=['user_no_profile', 'user_staff_missing']).delete()

u1 = User.objects.create_user('user_no_profile', 'no_profile@test.com', 'password123')
print("Testing login for user with NO UserProfile and NO StaffMember:")
client = APIClient()
res = client.post('/api/auth/login/', {'username': 'user_no_profile', 'password': 'password123'}, format='json')
print(f"Status: {res.status_code}")
print(f"Data: {res.data}")

print("\nTesting MeView (/api/auth/me/):")
if res.status_code == 200:
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    res_me = client.get('/api/auth/me/')
    print(f"MeView status: {res_me.status_code}, data: {res_me.data}")

# What if user has UserProfile with role='patient_family' but login with platform='web'?
u2 = User.objects.create_user('family_web', 'family_web@test.com', 'password123')
UserProfile.objects.create(user=u2, role=UserRole.PATIENT_FAMILY)
res2 = client.post('/api/auth/login/', {'username': 'family_web', 'password': 'password123', 'platform': 'web'}, format='json')
print(f"\nTesting family login with platform='web': status {res2.status_code}, data: {res2.data}")

# What if user has linked patient but NO UserProfile, and logs in with platform='web'?
u3 = User.objects.create_user('family_patient_no_profile', 'fam3@test.com', 'password123')
Patient.objects.create(mr_number='MR-P-3', first_name='P', last_name='3', date_of_birth='1990-01-01', gender='M', portal_user=u3)
res3 = client.post('/api/auth/login/', {'username': 'family_patient_no_profile', 'password': 'password123', 'platform': 'web'}, format='json')
print(f"\nTesting family with linked patient but NO profile, platform='web': status {res3.status_code}, data: {res3.data}")

# What about platform='mobile'?
res3_mob = client.post('/api/auth/login/', {'username': 'family_patient_no_profile', 'password': 'password123', 'platform': 'mobile'}, format='json')
print(f"\nTesting family with linked patient but NO profile, platform='mobile': status {res3_mob.status_code}, data: {res3_mob.data}")
