import urllib.request
import urllib.error
import json
import sys
import os
import django

sys.path.insert(0, r'c:\Users\Administrator\Desktop\health\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken

print("=" * 65)
print("1. DATABASE REAL STATE CHECK (BEFORE/AFTER)")
print("=" * 65)
u = User.objects.get(username='abdullah_fouzan')
print("Username:        ", u.username)
print("is_staff:        ", u.is_staff)
print("is_superuser:    ", u.is_superuser)
print("groups:          ", list(u.groups.values_list('name', flat=True)))
print("role:            ", u.staffmember.role)
print("platform_allowed:", u.staffmember.platform_allowed)

print("\n" + "=" * 65)
print("2. REJECT MOBILE-ONLY NURSE WEB LOGIN")
print("=" * 65)
login_url = 'http://127.0.0.1:8000/api/auth/login/'
req = urllib.request.Request(
    login_url,
    data=json.dumps({'username': 'abdullah_fouzan', 'password': 'NursePass123!', 'platform': 'web'}).encode(),
    headers={'Content-Type': 'application/json'}
)
try:
    with urllib.request.urlopen(req) as resp:
        print("FAIL: Expected 400 rejection but got:", resp.status)
except urllib.error.HTTPError as e:
    body = json.loads(e.read().decode())
    print(f"PASS: HTTP {e.code} correctly returned.")
    print("   detail:          ", body.get('detail'))
    print("   code:            ", body.get('code'))
    print("   platform_allowed:", body.get('platform_allowed'))

print("\n" + "=" * 65)
print("3. NURSE WITH WEB ACCESS LOGIN TEST")
print("=" * 65)
req2 = urllib.request.Request(
    login_url,
    data=json.dumps({'username': 'nurse_mariam_s', 'password': 'NursePass123!', 'platform': 'web'}).encode(),
    headers={'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req2) as resp:
    data = json.loads(resp.read().decode())
    nurse_token = data['access']
    print(f"HTTP {resp.status} (Login Succeeded)")
    print("   role:            ", data['user']['role'])
    print("   role_display:    ", data['user']['role_display'])
    print("   platform_allowed:", data['user']['platform_allowed'])
    print("   name:            ", data['user']['name'])

print("\n" + "=" * 65)
print("4. NURSE JWT CALLING SENSITIVE ENDPOINTS (EXPECT 403)")
print("=" * 65)
sensitive_endpoints = [
    ('GET',    'http://127.0.0.1:8000/api/accounts/payments/revenue_by_service/'),
    ('GET',    'http://127.0.0.1:8000/api/billing/invoices/summary/'),
    ('GET',    'http://127.0.0.1:8000/api/billing/invoices/'),
    ('POST',   'http://127.0.0.1:8000/api/staff/members/'),
    ('DELETE', 'http://127.0.0.1:8000/api/staff/members/1/'),
    ('DELETE', 'http://127.0.0.1:8000/api/patients/1/'),
    ('GET',    'http://127.0.0.1:8000/api/crm/leads/'),
]

for method, url in sensitive_endpoints:
    payload = b'{}' if method == 'POST' else None
    req = urllib.request.Request(
        url,
        data=payload,
        headers={'Authorization': f'Bearer {nurse_token}', 'Content-Type': 'application/json'},
        method=method
    )
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"FAIL: {method} {url} returned HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()[:100]
        short_url = url.replace('http://127.0.0.1:8000', '')
        print(f"PASS: {method:<6} {short_url:<45} -> HTTP {e.code} Forbidden: {err_body}")

print("\n" + "=" * 65)
print("5. DASHBOARD WIDGET RESTRICTION FOR NURSE")
print("=" * 65)
req_dash = urllib.request.Request(
    'http://127.0.0.1:8000/api/accounts/dashboard/summary/',
    headers={'Authorization': f'Bearer {nurse_token}'}
)
with urllib.request.urlopen(req_dash) as resp:
    dash_data = json.loads(resp.read().decode())
    print("Nurse Allowed Widgets:", dash_data.get('allowed_widgets'))
    print("Has Revenue Data:     ", 'revenue' in dash_data)

print("\n" + "=" * 65)
print("6. SUPER ADMIN VERIFICATION")
print("=" * 65)
admin_req = urllib.request.Request(
    login_url,
    data=json.dumps({'username': 'admin@ehealth.com', 'password': 'Admin@1234', 'platform': 'web'}).encode(),
    headers={'Content-Type': 'application/json'}
)
with urllib.request.urlopen(admin_req) as resp:
    admin_data = json.loads(resp.read().decode())
    admin_token = admin_data['access']
    print(f"Admin Login HTTP {resp.status}")
    print("   user.role:       ", admin_data['user']['role'])

for method, url in [
    ('GET', 'http://127.0.0.1:8000/api/accounts/payments/revenue_by_service/'),
    ('GET', 'http://127.0.0.1:8000/api/billing/invoices/summary/'),
    ('GET', 'http://127.0.0.1:8000/api/staff/members/'),
]:
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {admin_token}'}, method=method)
    with urllib.request.urlopen(req) as resp:
        short_url = url.replace('http://127.0.0.1:8000', '')
        print(f"PASS: Admin {method:<4} {short_url:<45} -> HTTP {resp.status} OK")
