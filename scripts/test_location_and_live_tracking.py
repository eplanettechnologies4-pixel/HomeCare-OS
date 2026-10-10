import os
import sys
import django

# Setup Django environment
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.test import RequestFactory
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from accounts.models import User, UserProfile, UserRole  # type: ignore
from staff.models import StaffMember  # type: ignore
from patients.models import Patient  # type: ignore
from bookings.models import Booking, BookingStatus  # type: ignore
from tracking.models import LiveVisit, LocationPing  # type: ignore
from homecareOS.location_resolver import resolve_location_link  # type: ignore

def run_tests():
    print("=" * 70)
    print("RUNNING LOCATION CAPTURE & LIVE TRACKING TESTS")
    print("=" * 70)

    # 1. Test location_resolver directly
    print("\n[Test 1] Testing resolve_location_link parser & SSRF protection...")
    
    # 1a. Raw lat, lng
    res = resolve_location_link("33.6844, 73.0479")
    lat, lng = res['latitude'], res['longitude']
    assert round(lat, 4) == 33.6844 and round(lng, 4) == 73.0479, f"Unexpected coords: {lat}, {lng}"
    print("  [PASS] Raw '33.6844, 73.0479' -> (33.6844, 73.0479)")

    # 1b. Google Maps query URL
    res = resolve_location_link("https://maps.google.com/?q=33.5651,73.0169")
    lat, lng = res['latitude'], res['longitude']
    assert round(lat, 4) == 33.5651 and round(lng, 4) == 73.0169, f"Unexpected coords: {lat}, {lng}"
    print("  [PASS] 'https://maps.google.com/?q=33.5651,73.0169' -> (33.5651, 73.0169)")

    # 1c. Google Maps @lat,lng URL
    res = resolve_location_link("https://www.google.com/maps/@33.6000,73.0500,15z")
    lat, lng = res['latitude'], res['longitude']
    assert round(lat, 4) == 33.6000 and round(lng, 4) == 73.0500, f"Unexpected coords: {lat}, {lng}"
    print("  [PASS] 'https://www.google.com/maps/@33.6000,73.0500,15z' -> (33.6000, 73.0500)")

    # 1d. SSRF prevention
    try:
        resolve_location_link("http://169.254.169.254/latest/meta-data/")
        assert False, "Should have rejected SSRF attempt"
    except ValueError as e:
        print(f"  [PASS] SSRF blocked: {e}")

    try:
        resolve_location_link("https://attacker-site.com/exploit")
        assert False, "Should have rejected non-Google domain"
    except ValueError as e:
        print(f"  [PASS] Non-allowlist domain blocked: {e}")

    # 2. Test POST /api/locations/resolve-link/
    print("\n[Test 2] Testing POST /api/locations/resolve-link/ authenticated endpoint...")
    client = APIClient()
    admin_user = User.objects.filter(is_superuser=True).first()
    if not admin_user:
        admin_user = User.objects.create_superuser('admin_test', 'admin@test.com', 'pass123')
    client.force_authenticate(user=admin_user)

    res = client.post('/api/locations/resolve-link/', {
        'url': 'https://maps.google.com/?q=33.6844,73.0479'
    }, format='json')
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.data}"
    assert round(res.data['latitude'], 4) == 33.6844 and round(res.data['longitude'], 4) == 73.0479
    print(f"  [PASS] Endpoint returned: {res.data}")

    # 3. Test Public Booking with location_link (and no lat/lng)
    print("\n[Test 3] Testing public booking resolution with location_link...")
    anon_client = APIClient()
    book_res = anon_client.post('/api/bookings/public/', {
        'full_name': 'Location Test Patient',
        'phone': '03001234567',
        'service_type': 'general_nursing',
        'address': 'Islamabad F-7/2',
        'location_link': 'https://maps.google.com/?q=33.7200,73.0550',
        'source': 'public_website',
    }, format='json')
    assert book_res.status_code == 201, f"Booking failed: {book_res.status_code}: {book_res.data}"
    booking_id = book_res.data.get('booking_id') or book_res.data.get('id')
    created_booking = Booking.objects.get(id=booking_id)
    assert round(float(created_booking.patient.latitude), 4) == 33.7200
    assert round(float(created_booking.patient.longitude), 4) == 73.0550
    print(f"  [PASS] Created booking #{booking_id} with patient lat={created_booking.patient.latitude}, lng={created_booking.patient.longitude}")

    # 4. Simulate 5 GPS pings
    print("\n[Test 4] Simulating 5 GPS pings with speed, heading, accuracy, battery...")
    from staff.models import StaffRole
    staff_member = StaffMember.objects.filter(user__isnull=False, role=StaffRole.NURSE).first()
    if not staff_member:
        nurse_user = User.objects.filter(profile__role=UserRole.NURSE).first()
        if not nurse_user:
            nurse_user = User.objects.create_user('nurse_test', 'nurse@test.com', 'pass123')
            UserProfile.objects.create(user=nurse_user, role=UserRole.NURSE)
        staff_member = StaffMember.objects.create(
            user=nurse_user,
            first_name='Test',
            last_name='Nurse',
            role=StaffRole.NURSE,
            employee_id='EMP-TEST-99',
            hire_date=timezone.now().date()
        )
    nurse_user = staff_member.user

    # Assign booking to this staff
    created_booking.assigned_staff = staff_member
    created_booking.status = BookingStatus.IN_PROGRESS
    created_booking.save()

    nurse_client = APIClient()
    nurse_client.force_authenticate(user=nurse_user)

    # 5 progressive points approaching patient (33.7200, 73.0550)
    pings_data = [
        {'latitude': 33.7100, 'longitude': 73.0450, 'speed': 25.5, 'heading': 45.0, 'accuracy_meters': 10.0, 'battery_level': 95},
        {'latitude': 33.7125, 'longitude': 73.0475, 'speed': 28.0, 'heading': 45.0, 'accuracy_meters': 8.5,  'battery_level': 94},
        {'latitude': 33.7150, 'longitude': 73.0500, 'speed': 30.2, 'heading': 45.0, 'accuracy_meters': 7.0,  'battery_level': 93},
        {'latitude': 33.7175, 'longitude': 73.0525, 'speed': 22.0, 'heading': 45.0, 'accuracy_meters': 6.0,  'battery_level': 92},
        {'latitude': 33.7190, 'longitude': 73.0540, 'speed': 15.0, 'heading': 45.0, 'accuracy_meters': 5.0,  'battery_level': 91},
    ]

    for i, p in enumerate(pings_data, 1):
        ping_res = nurse_client.post('/api/tracking/gps-ping/', {
            'booking_id': created_booking.id,
            **p
        }, format='json')
        assert ping_res.status_code == 200, f"Ping {i} failed: {ping_res.data}"
        print(f"  [PASS] Ping {i}: lat={p['latitude']}, lng={p['longitude']}, speed={p['speed']}km/h, bat={p['battery_level']}% -> Response OK")

    # Verify LocationPing records
    ping_count = LocationPing.objects.filter(booking=created_booking).count()
    assert ping_count >= 5, f"Expected at least 5 pings, got {ping_count}"
    print(f"  [PASS] Verified {ping_count} LocationPing records stored in database.")

    # 5. Check GET /api/tracking/live-visits/ (Fresh state: is_stale=False)
    print("\n[Test 5] Checking GET /api/tracking/live-visits/ for active visit and telemetry...")
    visits_res = client.get('/api/tracking/live-visits/')
    assert visits_res.status_code == 200
    visits_list = visits_res.data if isinstance(visits_res.data, list) else visits_res.data.get('results', [])
    our_visit = next((v for v in visits_list if v.get('booking') == created_booking.id or v.get('id') == created_booking.id), None)
    assert our_visit is not None, f"Visit for booking {created_booking.id} not found in live visits"
    
    assert our_visit.get('is_stale') is False, f"Expected is_stale=False, got {our_visit.get('is_stale')}"
    assert our_visit.get('speed') == 15.0, f"Expected speed=15.0, got {our_visit.get('speed')}"
    assert our_visit.get('battery_level') == 91, f"Expected battery_level=91, got {our_visit.get('battery_level')}"
    assert our_visit.get('last_ping_at') is not None, "Expected last_ping_at to be populated"
    print(f"  [PASS] Live visit details: is_stale={our_visit['is_stale']}, speed={our_visit['speed']}km/h, battery={our_visit['battery_level']}%, last_ping_at={our_visit['last_ping_at']}")

    # 6. Check Route Trail endpoint GET /api/tracking/staff/<id>/route/
    print("\n[Test 6] Checking GET /api/tracking/staff/<id>/route/?minutes=30...")
    route_res = client.get(f'/api/tracking/staff/{staff_member.id}/route/?limit=30&minutes=30')
    assert route_res.status_code == 200
    trail_pings = route_res.data.get('pings', [])
    assert len(trail_pings) >= 5, f"Expected at least 5 pings in trail, got {len(trail_pings)}"
    print(f"  [PASS] Staff route trail returned {len(trail_pings)} pings with telemetry (oldest to newest):")
    for tp in trail_pings[-3:]:
        print(f"    - lat={tp['lat']}, lng={tp['lng']}, speed={tp.get('speed')}, bat={tp.get('battery_level')}%")

    # 7. Check Stale State (> 2 minutes without ping)
    print("\n[Test 7] Checking stale state (> 2 minutes without ping)...")
    lv = LiveVisit.objects.get(booking=created_booking)
    lv.last_ping_at = timezone.now() - timedelta(seconds=130)
    lv.last_update = timezone.now() - timedelta(seconds=130)
    lv.save()

    stale_res = client.get('/api/tracking/live-visits/')
    assert stale_res.status_code == 200
    visits_list = stale_res.data if isinstance(stale_res.data, list) else stale_res.data.get('results', [])
    stale_visit = next((v for v in visits_list if v.get('booking') == created_booking.id or v.get('id') == created_booking.id), None)
    assert stale_visit is not None, f"Visit for booking {created_booking.id} not found in live visits"
    assert stale_visit.get('is_stale') is True, f"Expected is_stale=True, got {stale_visit.get('is_stale')}"
    print(f"  [PASS] Verified is_stale=True when last ping was > 120s ago (Signal lost triggered)")

    print("\n" + "=" * 70)
    print("ALL TESTS PASSED SUCCESSFULLY! [PASS]")
    print("=" * 70)

if __name__ == '__main__':
    run_tests()
