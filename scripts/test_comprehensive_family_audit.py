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
from datetime import date

# Set DEBUG=False to test production behavior and see if 500s occur
from django.conf import settings

User.objects.filter(username__in=['test_fam_linked', 'test_fam_unlinked']).delete()
Patient.objects.filter(mr_number='MR-AUDIT-1').delete()

# User 1: Linked family user
u_linked = User.objects.create_user('test_fam_linked', 'fam_linked@test.com', 'pass1234')
UserProfile.objects.create(user=u_linked, role=UserRole.PATIENT_FAMILY)
p = Patient.objects.create(
    mr_number='MR-AUDIT-1',
    first_name='Audit',
    last_name='Patient',
    date_of_birth=date(1985, 5, 5),
    gender=Patient.Gender.FEMALE,
    phone='03001112233',
    address='Street 1, Lahore',
    portal_user=u_linked
)

# User 2: Unlinked family user (has UserProfile patient_family, but no linked Patient)
u_unlinked = User.objects.create_user('test_fam_unlinked', 'fam_unlinked@test.com', 'pass1234')
UserProfile.objects.create(user=u_unlinked, role=UserRole.PATIENT_FAMILY)

# User 3: Unlinked family user with NO UserProfile at all
u_no_prof = User.objects.create_user('test_fam_noprof', 'fam_noprof@test.com', 'pass1234')

client = APIClient()

endpoints = [
    ('POST', '/api/auth/login/', {'username': 'USER', 'password': 'pass1234'}),
    ('GET',  '/api/auth/me/', None),
    ('GET',  '/api/accounts/dashboard/summary/', None),
    ('GET',  '/api/portal/my/patient_profile/', None),
    ('GET',  '/api/portal/my/patient/', None),
    ('GET',  '/api/portal/my/visits/', None),
    ('GET',  '/api/portal/my/vitals/', None),
    ('GET',  '/api/portal/my/invoices/', None),
    ('GET',  '/api/portal/my/messages/', None),
    ('GET',  '/api/bookings/today/', None),
    ('GET',  '/api/bookings/active/', None),
    ('GET',  '/api/tracking/live-visits/', None),
    ('GET',  '/api/tracking/geofence-events/', None),
    ('GET',  '/api/tracking/sos/', None),
    ('GET',  '/api/tracking/sos/active/', None),
    ('GET',  '/api/notifications/', None),
    ('GET',  '/api/notifications/unread-count/', None),
    ('POST', '/api/notifications/read-all/', {}),
    ('GET',  '/api/reports/overview/', None),
    ('GET',  '/api/staff/leave-requests/', None),
]

for label, user in [('LINKED FAMILY', u_linked), ('UNLINKED FAMILY (with profile)', u_unlinked), ('UNLINKED FAMILY (no profile)', u_no_prof)]:
    print(f"\n=================== {label}: {user.username} ===================")
    client.credentials() # clear
    # First authenticate
    client.force_authenticate(user=user)
    
    for method, url, data in endpoints:
        if url == '/api/auth/login/':
            # Test actual login
            c_anon = APIClient()
            for platform in [None, 'web', 'mobile']:
                payload = {'username': user.username, 'password': 'pass1234'}
                if platform: payload['platform'] = platform
                res = c_anon.post(url, payload, format='json')
                print(f"POST {url} [platform={platform}] -> {res.status_code}")
                if res.status_code >= 500:
                    print("  500 ERROR CONTENT:", res.content)
            continue
            
        try:
            if method == 'GET':
                res = client.get(url)
            else:
                res = client.post(url, data, format='json')
            print(f"{method} {url} -> {res.status_code}")
            if res.status_code >= 500:
                print(f"  500 ERROR CONTENT: {res.content}")
        except Exception as e:
            import traceback
            print(f"{method} {url} -> EXCEPTION: {e}")
            traceback.print_exc()
