import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
backend_dir = r'C:\Users\Administrator\Desktop\health\backend'
os.chdir(backend_dir)
sys.path.insert(0, backend_dir)
django.setup()

from django.contrib.auth.models import User
from staff.models import StaffMember
from staff.serializers import StaffCreateSerializer
from homecareOS.auth_views import CustomTokenObtainPairSerializer

print("--- Testing Staff Creation via StaffCreateSerializer ---")
data = {
    'first_name': 'Maryam',
    'last_name': 'Nawaz',
    'username': 'nurse_maryam',
    'password': 'SecurePass123!',
    'password_confirm': 'SecurePass123!',
    'role': 'nurse',
    'specialization': 'ICU & Wound Care',
    'phone': '0312-3456789',
    'email': 'maryam.nawaz@ehealth.com',
    'platform_allowed': 'mobile'
}

# Clean previous test if any
User.objects.filter(username='nurse_maryam').delete()

serializer = StaffCreateSerializer(data=data)
if serializer.is_valid():
    staff_obj = serializer.save()
    print("SUCCESS: Created StaffMember:", staff_obj.employee_id, staff_obj.user.username)
    print("Full response payload:", serializer.data)
else:
    print("ERROR in validation:", serializer.errors)
    sys.exit(1)

print("\n--- Testing Login with Created Credentials ---")
# Test 1: login with username
login_serializer = CustomTokenObtainPairSerializer(data={
    'username': 'nurse_maryam',
    'password': 'SecurePass123!'
})
if login_serializer.is_valid():
    tokens = login_serializer.validated_data
    print("SUCCESS: Logged in with username 'nurse_maryam'!")
    print("Returned User data:", tokens['user'])
    print("Access token generated:", bool(tokens['access']))
else:
    print("ERROR: Login with username failed:", login_serializer.errors)
    sys.exit(1)

# Test 2: login with email
login_email_serializer = CustomTokenObtainPairSerializer(data={
    'username': 'maryam.nawaz@ehealth.com',
    'password': 'SecurePass123!'
})
if login_email_serializer.is_valid():
    tokens = login_email_serializer.validated_data
    print("SUCCESS: Logged in with email 'maryam.nawaz@ehealth.com'!")
else:
    print("ERROR: Login with email failed:", login_email_serializer.errors)
    sys.exit(1)

# Clean up test user so test is idempotent
User.objects.filter(username='nurse_maryam').delete()
print("\nTest user cleaned up successfully.")
