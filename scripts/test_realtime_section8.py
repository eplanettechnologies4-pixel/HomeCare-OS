import os
import sys
import django
import time
import json
import asyncio

sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework.test import APIClient
from channels.testing import WebsocketCommunicator
from asgiref.sync import sync_to_async
from homecareOS.asgi import application
from staff.models import StaffMember
from patients.models import Patient
from bookings.models import Booking
from tracking.models import SOSEvent, LiveVisit
from datetime import date, datetime, timezone

# ── 1. Setup Test DB fixtures synchronously ────────────────────────────────
print("Setting up test fixtures...")
Patient.objects.filter(mr_number='MR-RT-001').delete()
StaffMember.objects.filter(employee_id='EMP-RT-001').delete()
User.objects.filter(username__in=['rt_admin', 'rt_nurse', 'rt_family']).delete()

admin_user = User.objects.create_superuser('rt_admin', 'admin@test.com', 'adminpass')
nurse_user = User.objects.create_user('rt_nurse', 'nurse@test.com', 'nursepass')
family_user = User.objects.create_user('rt_family', 'family@test.com', 'fampass')

nurse_staff = StaffMember.objects.create(
    user=nurse_user,
    employee_id='EMP-RT-001',
    first_name='Amina',
    last_name='Begum',
    role='nurse',
    hire_date=date(2025, 1, 1),
    phone='03009998877'
)

patient = Patient.objects.create(
    mr_number='MR-RT-001',
    first_name='Zubair',
    last_name='Khan',
    date_of_birth=date(1975, 4, 12),
    gender=Patient.Gender.MALE,
    phone='03001234567',
    address='Model Town, Lahore',
    latitude=31.4800,
    longitude=74.3200,
    portal_user=family_user
)

booking = Booking.objects.create(
    patient=patient,
    assigned_staff=nurse_staff,
    scheduled_time=datetime(2026, 10, 15, 10, 0, tzinfo=timezone.utc),
    status='assigned',
)

admin_token = str(AccessToken.for_user(admin_user))
nurse_token = str(AccessToken.for_user(nurse_user))
family_token = str(AccessToken.for_user(family_user))

async def test_suite():
    print("\n" + "="*60)
    print("HomeCare OS Real-Time & Security Automated Test Suite")
    print("="*60)

    # ------------------------------------------------------------------
    # 1. Staff client sends location_update; dashboard receives it + latency
    # ------------------------------------------------------------------
    print("\n[TEST 1] Staff location_update -> Dashboard client broadcast & latency")
    dashboard_comm = WebsocketCommunicator(application, f"/ws/tracking/?token={admin_token}")
    staff_comm = WebsocketCommunicator(application, f"/ws/tracking/?token={nurse_token}")

    dash_connected, _ = await dashboard_comm.connect()
    staff_connected, _ = await staff_comm.connect()
    assert dash_connected, "Dashboard client failed to connect"
    assert staff_connected, "Staff client failed to connect"

    t0 = time.perf_counter()
    await staff_comm.send_to(text_data=json.dumps({
        'type': 'location_update',
        'staff_id': nurse_staff.id,
        'booking_id': booking.id,
        'lat': 31.4850,
        'lng': 74.3250,
        'eta_minutes': 12,
    }))

    received_raw = await dashboard_comm.receive_from(timeout=3.0)
    latency_ms = (time.perf_counter() - t0) * 1000
    msg = json.loads(received_raw)
    assert msg.get('type') == 'location_update', f"Unexpected message type: {msg}"
    assert float(msg.get('lat')) == 31.4850
    assert float(msg.get('lng')) == 74.3250
    print(f" PASS: Dashboard received location_update in {latency_ms:.2f} ms")
    print(f"       Payload: staff_id={msg.get('staff_id')}, lat={msg.get('lat')}, lng={msg.get('lng')}, eta={msg.get('eta_minutes')} min")

    # ------------------------------------------------------------------
    # 2. REST POST /api/tracking/gps-ping/ -> Dashboard client receives message
    # ------------------------------------------------------------------
    print("\n[TEST 2] REST POST /api/tracking/gps-ping/ -> Dashboard WebSocket message")
    client = APIClient()
    client.force_authenticate(user=nurse_user)

    t0 = time.perf_counter()
    rest_res = await asyncio.to_thread(client.post, '/api/tracking/gps-ping/', {
        'booking_id': booking.id,
        'lat': 31.4865,
        'lng': 74.3260,
        'speed': 32.5,
        'heading': 180.0,
        'battery_level': 88,
    }, format='json')
    assert rest_res.status_code == 200, f"GPS ping failed: {rest_res.data}"

    received_raw = await dashboard_comm.receive_from(timeout=3.0)
    latency_ms = (time.perf_counter() - t0) * 1000
    msg = json.loads(received_raw)
    assert msg.get('type') == 'location_update', f"Unexpected message: {msg}"
    assert float(msg.get('lat')) == 31.4865
    print(f" PASS: Dashboard received broadcast from REST gps-ping in {latency_ms:.2f} ms")
    print(f"       LiveVisit updated in DB: lat={msg.get('lat')}, speed={msg.get('speed')}, battery={msg.get('battery_level')}%")

    # ------------------------------------------------------------------
    # 3. Check-in and Check-out produce geofence_event messages
    # ------------------------------------------------------------------
    print("\n[TEST 3] Check-in and check-out produce geofence_event messages")
    # Check-in
    checkin_res = await asyncio.to_thread(client.post, '/api/tracking/check-in/', {
        'booking_id': booking.id,
        'lat': 31.4800,
        'lng': 74.3200,
        'method': 'geofence_auto'
    }, format='json')
    assert checkin_res.status_code == 201, f"Check-in failed: {checkin_res.data}"
    msg_raw = await dashboard_comm.receive_from(timeout=3.0)
    msg_checkin = json.loads(msg_raw)
    assert msg_checkin.get('type') == 'geofence_event'
    assert msg_checkin.get('event_type') == 'check_in'
    print(f" PASS: Check-in generated geofence_event (event_type='check_in', booking_id={msg_checkin.get('booking_id')})")

    # Check-out
    checkout_res = await asyncio.to_thread(client.post, '/api/tracking/check-out/', {
        'booking_id': booking.id,
        'lat': 31.4800,
        'lng': 74.3200,
    }, format='json')
    assert checkout_res.status_code == 201, f"Check-out failed: {checkout_res.data}"
    msg_raw = await dashboard_comm.receive_from(timeout=3.0)
    msg_checkout = json.loads(msg_raw)
    assert msg_checkout.get('type') == 'geofence_event'
    assert msg_checkout.get('event_type') == 'check_out'
    print(f" PASS: Check-out generated geofence_event (event_type='check_out', booking_id={msg_checkout.get('booking_id')})")

    # ------------------------------------------------------------------
    # 4. SOS produces an sos message and appears in GET /api/tracking/sos/active/
    # ------------------------------------------------------------------
    print("\n[TEST 4] SOS produces WS sos message and appears in GET /api/tracking/sos/active/")
    sos_res = await asyncio.to_thread(client.post, '/api/tracking/sos/', {
        'booking_id': booking.id,
        'lat': 31.4810,
        'lng': 74.3210,
        'notes': 'Panic button pressed by field staff'
    }, format='json')
    assert sos_res.status_code == 201, f"SOS create failed: {sos_res.data}"
    sos_id = sos_res.data['id']

    msg_raw = await dashboard_comm.receive_from(timeout=3.0)
    msg_sos = json.loads(msg_raw)
    assert msg_sos.get('type') == 'sos'
    assert msg_sos.get('sos_id') == sos_id
    print(f" PASS: WS broadcasted sos message to dashboard (sos_id={sos_id})")

    # Verify GET /api/tracking/sos/active/
    active_sos_res = await asyncio.to_thread(client.get, '/api/tracking/sos/active/')
    assert active_sos_res.status_code == 200
    active_ids = [item['id'] for item in active_sos_res.data]
    assert sos_id in active_ids, f"SOS id {sos_id} not in active SOS list: {active_ids}"
    print(f" PASS: SOS {sos_id} is present in GET /api/tracking/sos/active/")

    # Disconnect communicators
    await staff_comm.disconnect()
    await dashboard_comm.disconnect()

    # ------------------------------------------------------------------
    # 5. Bad or expired token is rejected
    # ------------------------------------------------------------------
    print("\n[TEST 5] Bad or expired token rejection")
    bad_comm = WebsocketCommunicator(application, "/ws/tracking/?token=bad.token.value")
    connected, code = await bad_comm.connect()
    assert not connected, "Bad token should not connect"
    assert code == 4003, f"Expected close code 4003, got {code}"
    print(" PASS: Bad token rejected cleanly with close code 4003")

    # ------------------------------------------------------------------
    # 6. Role checks (Nurse 403 on billing/staff-create/CRM, Family 403 on POST prescriptions)
    # ------------------------------------------------------------------
    print("\n[TEST 6] RBAC Role Checks")
    # Nurse role checks
    nurse_client = APIClient()
    nurse_client.force_authenticate(user=nurse_user)

    # 6a: Nurse on billing
    res_billing = await asyncio.to_thread(nurse_client.get, '/api/billing/invoices/')
    print(f" Nurse GET /api/billing/invoices/ -> {res_billing.status_code} (Expected: 403)")
    assert res_billing.status_code == 403, f"Expected 403 on billing, got {res_billing.status_code}"

    # 6b: Nurse on staff-create
    res_staff_create = await asyncio.to_thread(nurse_client.post, '/api/staff/members/', {
        'first_name': 'Hacker',
        'last_name': 'Staff',
        'role': 'nurse',
        'phone': '03000000000',
        'hire_date': '2026-01-01',
    }, format='json')
    print(f" Nurse POST /api/staff/members/ -> {res_staff_create.status_code} (Expected: 403)")
    assert res_staff_create.status_code == 403, f"Expected 403 on staff-create, got {res_staff_create.status_code}"

    # 6c: Nurse on CRM
    res_crm = await asyncio.to_thread(nurse_client.get, '/api/crm/leads/')
    print(f" Nurse GET /api/crm/leads/ -> {res_crm.status_code} (Expected: 403)")
    assert res_crm.status_code == 403, f"Expected 403 on CRM, got {res_crm.status_code}"

    # 6d: Family on POST prescriptions
    family_client = APIClient()
    family_client.force_authenticate(user=family_user)
    res_family_rx = await asyncio.to_thread(family_client.post, f'/api/patients/{patient.id}/prescriptions/', {
        'notes': 'Family trying to add prescription',
    }, format='json')
    print(f" Family POST /api/patients/{patient.id}/prescriptions/ -> {res_family_rx.status_code} (Expected: 403)")
    assert res_family_rx.status_code == 403, f"Expected 403 on family POST prescription, got {res_family_rx.status_code}"

    print("\nALL REAL-TIME & RBAC TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    asyncio.run(test_suite())
