import os
import sys
import django

sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from patients.models import Patient, Prescription
from staff.models import StaffMember
from bookings.models import Booking
from datetime import date, datetime

# Create staff user (e.g. nurse/doctor)
User.objects.filter(username='doc_test_rx').delete()
u = User.objects.create_user('doc_test_rx', 'doc@test.com', 'pass1234')
staff = StaffMember.objects.create(user=u, first_name='Dr', last_name='Smith', role='doctor', hire_date=date(2025, 1, 1), phone='03001234567')

Patient.objects.filter(mr_number='MR-RX-TEST').delete()
patient = Patient.objects.create(
    mr_number='MR-RX-TEST',
    first_name='Rx',
    last_name='Patient',
    date_of_birth=date(1990, 1, 1),
    gender=Patient.Gender.MALE,
    phone='03001234567',
    address='Hospital',
)

booking = Booking.objects.create(
    patient=patient,
    assigned_staff=staff,
    scheduled_time=datetime(2026, 10, 15, 10, 0),
    status='assigned',
)

client = APIClient()
client.force_authenticate(user=u)

# Create dummy document file
doc_file = SimpleUploadedFile("prescription.pdf", b"%PDF-1.4 dummy pdf content", content_type="application/pdf")

payload = {
    'booking': booking.id,
    'notes': 'Follow up in 2 weeks',
    'document': doc_file,
}

print(f"Testing POST /api/patients/{patient.id}/prescriptions/ with only [booking, notes, document]...")
res = client.post(f'/api/patients/{patient.id}/prescriptions/', payload, format='multipart')
print(f"Status Code: {res.status_code}")
print(f"Response Data: {res.data}")

if res.status_code == 201:
    rx = Prescription.objects.get(pk=res.data['id'])
    print(f"Prescription created successfully! ID: {rx.id}")
    print(f"  medication: {rx.medication}")
    print(f"  date: {rx.date}")
    print(f"  prescribed_by: {rx.prescribed_by}")
    print(f"  dosage: {rx.dosage}")
    print(f"  frequency: {rx.frequency}")
    print(f"  document: {rx.document.name}")
    print(f"  notes: {rx.notes}")
else:
    print(f"Failed: {res.data}")
