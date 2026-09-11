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
from patients.models import Patient
from bookings.models import Booking
from tracking.models import LiveVisit, GeofenceEvent, SOSEvent, AlertRule

print("===============================================================")
print("                   DATABASE CENSUS REPORT                      ")
print("===============================================================\n")

print("--- 1. USERS (django.contrib.auth.models.User) ---")
for u in User.objects.all():
    print(f"ID: {u.id} | Username: {u.username} | Email: {u.email} | Superuser: {u.is_superuser} | Staff: {u.is_staff}")

print("\n--- 2. STAFF MEMBERS (staff.models.StaffMember) ---")
for s in StaffMember.objects.all():
    print(f"ID: {s.id} | Employee ID: {s.employee_id} | Name: {s.full_name} | Role: {s.role} | User: {s.user.username if s.user else 'None'} | Phone: {s.phone}")

print("\n--- 3. PATIENTS (patients.models.Patient) ---")
for p in Patient.objects.all():
    print(f"ID: {p.id} | MR#: {p.mr_number} | Name: {p.full_name} | Phone: {p.phone} | Address: {p.address}")

print("\n--- 4. BOOKINGS (bookings.models.Booking) ---")
for b in Booking.objects.all():
    p_name = b.patient.full_name if b.patient else 'None'
    s_name = b.assigned_staff.full_name if b.assigned_staff else 'None'
    print(f"ID: {b.id} | Patient: {p_name} | Staff: {s_name} | Status: {b.status} | Scheduled: {b.scheduled_time}")

print("\n--- 5. TRACKING & LIVE VISITS (tracking.models.LiveVisit) ---")
for lv in LiveVisit.objects.all():
    s_name = lv.staff.full_name if lv.staff else 'None'
    print(f"ID: {lv.id} | Booking ID: {lv.booking_id} | Staff: {s_name} | ETA: {lv.eta_minutes}m | Coords: ({lv.current_latitude}, {lv.current_longitude})")

print("\n--- 6. GEOFENCE EVENTS (tracking.models.GeofenceEvent) ---")
for ge in GeofenceEvent.objects.all():
    print(f"ID: {ge.id} | Booking ID: {ge.booking_id} | Event: {ge.event_type} | Time: {ge.timestamp}")

print("\n--- 7. SOS EVENTS (tracking.models.SOSEvent) ---")
for sos in SOSEvent.objects.all():
    print(f"ID: {sos.id} | Booking ID: {sos.booking_id} | Status: {sos.status} | Triggered: {sos.triggered_at}")

print("\n===============================================================")
