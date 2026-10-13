import os
import sys
import django
import asyncio

sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import AccessToken
from channels.testing import WebsocketCommunicator
from homecareOS.asgi import application
from staff.models import StaffMember
from datetime import date

# Synchronous setup outside async loop
StaffMember.objects.filter(employee_id='EMP-WS-001').delete()
User.objects.filter(username='ws_test_nurse').delete()
user = User.objects.create_user('ws_test_nurse', 'nurse@test.com', 'pass1234')
StaffMember.objects.create(
    user=user,
    employee_id='EMP-WS-001',
    first_name='Nurse',
    last_name='Joy',
    role='nurse',
    hire_date=date(2025, 1, 1),
    phone='03001234567'
)
token = str(AccessToken.for_user(user))

async def run_ws_tests():
    print("=== Testing WebSocket Auth & Origin Behavior ===")
    
    # Test 1: Valid JWT, NO Origin header
    print("\nTest 1: Valid JWT, NO Origin header")
    communicator_no_origin = WebsocketCommunicator(
        application,
        f"/ws/tracking/?token={token}",
        headers=[] # Explicitly NO Origin header
    )
    connected, subprotocol = await communicator_no_origin.connect()
    print(f"Connected: {connected}")
    assert connected is True, "Expected connection to succeed with no Origin header!"
    await communicator_no_origin.disconnect()
    print("PASS: Client with NO Origin and valid JWT connected successfully.")
    
    # Test 2: Missing token
    print("\nTest 2: Missing token")
    communicator_no_token = WebsocketCommunicator(
        application,
        "/ws/tracking/",
        headers=[]
    )
    connected, code = await communicator_no_token.connect()
    print(f"Connected: {connected}, Close code: {code}")
    assert connected is False, "Expected unauthenticated connection to be rejected!"
    assert code == 4003, f"Expected close code 4003, got {code}"
    print("PASS: Client with missing token rejected cleanly with code 4003.")
    
    # Test 3: Invalid/expired token
    print("\nTest 3: Bad/invalid token")
    communicator_bad_token = WebsocketCommunicator(
        application,
        "/ws/tracking/?token=invalid.token.signature",
        headers=[]
    )
    connected, code = await communicator_bad_token.connect()
    print(f"Connected: {connected}, Close code: {code}")
    assert connected is False, "Expected bad token connection to be rejected!"
    assert code == 4003, f"Expected close code 4003, got {code}"
    print("PASS: Client with invalid token rejected cleanly with code 4003.")

if __name__ == '__main__':
    asyncio.run(run_ws_tests())
