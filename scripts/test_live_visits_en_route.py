import os
import sys
import django

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework.test import APIClient
from bookings.models import Booking, BookingStatus
from staff.models import StaffMember, StaffRole
from patients.models import Patient
from tracking.models import LiveVisit
from django.utils import timezone

def test_en_route_live_visits():
    client = APIClient()
    admin_user, _ = User.objects.get_or_create(username='admin_tracking_test', defaults={'is_superuser': True, 'is_staff': True})
    client.force_authenticate(user=admin_user)

    staff_user, _ = User.objects.get_or_create(username='staff_enroute_test')
    staff, _ = StaffMember.objects.get_or_create(
        user=staff_user,
        defaults={'first_name': 'EnRoute', 'last_name': 'Nurse', 'role': StaffRole.NURSE, 'phone': '03009998877', 'hire_date': '2024-01-01', 'employee_id': 'EMP-ENROUTE-99'}
    )
    staff.current_latitude = 33.7294
    staff.current_longitude = 73.0931
    staff.save()

    patient, _ = Patient.objects.get_or_create(
        mr_number='MR-ENROUTE-01',
        defaults={'first_name': 'Patient', 'last_name': 'EnRoute', 'phone': '03001112233', 'date_of_birth': '1975-05-05', 'gender': 'female'}
    )

    # Clean existing live visits
    LiveVisit.objects.all().delete()

    # Create an EN_ROUTE booking (staff pressed "Start Visit")
    booking = Booking.objects.create(
        patient=patient,
        assigned_staff=staff,
        service_type='nursing',
        status=BookingStatus.EN_ROUTE,
        scheduled_time=timezone.now(),
    )

    # Query GET /api/tracking/live-visits/
    res = client.get('/api/tracking/live-visits/')
    print(f"Status Code: {res.status_code}")
    results = res.data.get('results', res.data) if isinstance(res.data, dict) else res.data
    print(f"Returned Live Visits count: {len(results)}")
    assert res.status_code == 200
    assert len(results) >= 1

    item = next((v for v in results if (v.get('booking') if isinstance(v, dict) else getattr(v, 'booking', None)) == booking.id), None)
    assert item is not None, f"Booking {booking.id} not found in live visits! items: {results}"
    print(f"En-route staff ID: {item['staff']}")
    print(f"En-route coordinates: lat={item['current_latitude']}, lng={item['current_longitude']}")
    print(f"Booking status: {item['booking_status']}")
    print("[PASS] En-route staff member successfully synthesized and returned in GET /api/tracking/live-visits/ before check-in!")

if __name__ == '__main__':
    test_en_route_live_visits()
