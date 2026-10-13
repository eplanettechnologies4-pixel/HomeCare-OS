#!/usr/bin/env python3
"""
Create test visit (future, status pending) and test invoice for patient id 5.
Fetch and print the raw JSON for /api/portal/my/visits/ and /api/portal/my/invoices/.
"""
import os
import sys
import json
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(BASE_DIR, 'backend')
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
import django
django.setup()

from django.utils import timezone
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from patients.models import Patient
from bookings.models import Booking
from billing.models import Invoice, InvoiceLineItem, InvoiceStatus, BillingType
from staff.models import StaffMember


def main():
    # 1. Fetch patient 5
    patient = Patient.objects.filter(pk=5).first()
    if not patient:
        print("Error: Patient with ID 5 does not exist.")
        return

    # Ensure portal user exists for patient 5
    if not patient.portal_user:
        portal_user, _ = User.objects.get_or_create(
            username='family_tariq',
            defaults={
                'email': 'tariq.family@example.com',
                'first_name': 'Tariq',
                'last_name': 'Family',
                'is_active': True,
            }
        )
        portal_user.set_password('family123')
        portal_user.save()
        patient.portal_user = portal_user
        patient.save()

    # 2. Create test visit for patient 5 (scheduled in the future, status pending)
    future_time = timezone.now() + timedelta(days=2, hours=3)
    nurse = StaffMember.objects.filter(role='nurse').first()
    booking, created_b = Booking.objects.get_or_create(
        reference_code='BK-TEST-P5-FUTURE',
        defaults={
            'patient': patient,
            'assigned_staff': nurse,
            'scheduled_time': future_time,
            'service_type': 'nursing',
            'status': 'pending',
            'payment_status': 'pending',
            'payment_method': 'cash',
            'shift_duration': '12_hours',
            'shift_frequency': 'daily',
            'notes': 'Scheduled future clinical follow-up visit for post-op vitals & dressing.',
        }
    )
    if not created_b:
        booking.scheduled_time = future_time
        booking.status = 'pending'
        booking.save()

    # 3. Create test invoice for patient 5
    invoice, created_i = Invoice.objects.get_or_create(
        invoice_number='INV-2026-P5-TEST',
        defaults={
            'patient': patient,
            'booking': booking,
            'billing_type': BillingType.VISIT,
            'status': InvoiceStatus.PENDING,
            'issued_date': timezone.now().date(),
            'due_date': timezone.now().date() + timedelta(days=14),
            'subtotal': 15000.00,
            'discount': 0.00,
            'tax': 0.00,
            'total': 15000.00,
            'amount_paid': 0.00,
            'notes': 'Initial consultation and post-op wound care package invoice.',
        }
    )
    if not created_i:
        invoice.total = 15000.00
        invoice.amount_paid = 0.00
        invoice.status = InvoiceStatus.PENDING
        invoice.save()

    # Create line items if not present
    if not invoice.line_items.exists():
        InvoiceLineItem.objects.create(
            invoice=invoice,
            description="Specialized Post-Operative Wound Care & Dressing",
            quantity=2,
            unit_price=5000.00,
            amount=10000.00,
        )
        InvoiceLineItem.objects.create(
            invoice=invoice,
            description="Clinical Nursing & Vital Signs Monitoring",
            quantity=1,
            unit_price=5000.00,
            amount=5000.00,
        )

    # 4. Use APIClient to fetch real JSON as authenticated user
    client = APIClient()
    admin_user = User.objects.filter(is_superuser=True).first()
    client.force_authenticate(user=admin_user)

    # A) /api/portal/my/visits/
    res_visits = client.get('/api/portal/my/visits/?patient_id=5')
    visits_json = res_visits.json()

    # B) /api/portal/my/invoices/
    res_invoices = client.get('/api/portal/my/invoices/?patient_id=5')
    invoices_json = res_invoices.json()

    print("=================== RAW JSON: /api/portal/my/visits/?patient_id=5 ===================")
    print(json.dumps(visits_json, indent=2))

    print("\n=================== RAW JSON: /api/portal/my/invoices/?patient_id=5 ===================")
    print(json.dumps(invoices_json, indent=2))


if __name__ == '__main__':
    main()
