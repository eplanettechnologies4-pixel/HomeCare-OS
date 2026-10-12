import json
import datetime
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
from channels.testing import WebsocketCommunicator
from accounts.models import UserProfile, UserRole
from patients.models import Patient
from staff.models import StaffMember
from homecareOS.asgi import application


class WebSocketTrackingSecurityTests(TestCase):
    """
    Test suite for WebSocket tracking:
    - 101 Switching Protocols connection handshake with JWT auth
    - Staff/Admin joins 'tracking' group and can send location_update
    - Family users are restricted: cannot send location_update; only receive their patient's updates
    - Unauthenticated connections are rejected
    """

    def setUp(self):
        # 1. Staff user
        self.staff_user = User.objects.create_user(username='ws_staff', password='password123')
        self.staff_member = StaffMember.objects.create(
            user=self.staff_user,
            first_name='Nurse',
            last_name='Staff',
            employee_id='EMP-WS-001',
            hire_date=datetime.date(2020, 1, 1),
            role='nurse',
            status='available',
        )
        self.staff_token = str(RefreshToken.for_user(self.staff_user).access_token)

        # 2. Family user
        self.family_user = User.objects.create_user(username='ws_family', password='password123')
        UserProfile.objects.create(user=self.family_user, role=UserRole.PATIENT_FAMILY)
        self.patient = Patient.objects.create(
            mr_number='MR-WS-001',
            first_name='Charlie',
            last_name='Patient',
            date_of_birth=datetime.date(1975, 3, 3),
            gender='M',
            portal_user=self.family_user,
        )
        self.family_token = str(RefreshToken.for_user(self.family_user).access_token)

    async def test_unauthenticated_connection_rejected(self):
        communicator = WebsocketCommunicator(application, '/ws/tracking/')
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_staff_connection_and_location_update(self):
        communicator = WebsocketCommunicator(
            application,
            f'/ws/tracking/?token={self.staff_token}'
        )
        connected, subprotocol = await communicator.connect()
        self.assertTrue(connected)

        # Staff sends location_update
        await communicator.send_json_to({
            'type': 'location_update',
            'staff_id': self.staff_member.id,
            'lat': 24.8607,
            'lng': 67.0104,
            'eta_minutes': 10,
        })

        # Staff receives broadcasted location_update from tracking group
        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'location_update')
        self.assertEqual(response['staff_id'], self.staff_member.id)
        self.assertEqual(response['lat'], 24.8607)
        self.assertEqual(response['lng'], 67.0104)

        await communicator.disconnect()

    async def test_family_user_cannot_send_location_update(self):
        communicator = WebsocketCommunicator(
            application,
            f'/ws/tracking/?token={self.family_token}'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Family user attempts to send location_update
        await communicator.send_json_to({
            'type': 'location_update',
            'staff_id': 999,
            'lat': 24.8607,
            'lng': 67.0104,
        })

        # Family receives permission denied error
        response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'error')
        self.assertIn('Permission denied', response['error'])

        await communicator.disconnect()
