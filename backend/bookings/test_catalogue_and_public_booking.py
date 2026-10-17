import os
import re
from decimal import Decimal
from django.urls import reverse
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase
from patients.models import Patient
from bookings.models import Booking, ServiceCatalogItem, ServiceType
from bookings.views import compute_catalog_price
from crm.models import Lead
from billing.services import generate_invoice_for_booking
from billing.models import Invoice, InvoiceLineItem


class ServiceCatalogAndPublicBookingSecurityTests(APITestCase):

    def setUp(self):
        os.environ['PUBLIC_BOOKING_THROTTLE_RATE'] = '10000/hour'
        cache.clear()
        # Ensure catalog is seeded
        from bookings.catalog_data import CATALOG_SEED_DATA
        active_keys = set()
        for item in CATALOG_SEED_DATA:
            active_keys.add((item['category'], item['name']))
            ServiceCatalogItem.objects.update_or_create(
                category=item['category'],
                name=item['name'],
                defaults={
                    'caption': item.get('caption', ''),
                    'price_min': item.get('price_min'),
                    'price_max': item.get('price_max'),
                    'price_text': item.get('price_text', ''),
                    'sort_order': item.get('sort_order', 0),
                    'is_active': True,
                }
            )
        for item in ServiceCatalogItem.objects.filter(is_active=True):
            if (item.category, item.name) not in active_keys:
                item.is_active = False
                item.save(update_fields=['is_active'])

        self.staff_user = User.objects.create_superuser(
            username='admin_staff',
            email='admin@homecare.pk',
            password='Password123!'
        )

    # ── Test 1: Legacy payload still returns 201 ──────────────────────────────
    def test_legacy_payload_still_returns_201(self):
        url = '/api/bookings/public/'
        legacy_payload = {
            'patient_name': 'Haji Muhammad',
            'phone': '03001234567',
            'service_type': 'short_service',
            'scheduled_time': '2026-10-20 10:00',
            'address': 'House 12, Street 4, F-8/1, Islamabad',
            'diagnosis': 'Hypertension and vitals monitoring',
            'notes': 'Please ring front doorbell twice.',
        }
        res = self.client.post(url, data=legacy_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertIn('booking_reference', res.data)
        self.assertIn('patient_mr_number', res.data)
        self.assertEqual(res.data['status'], 'pending')

        booking = Booking.objects.get(reference_code=res.data['booking_reference'])
        self.assertEqual(booking.service_type, 'short_service')
        self.assertEqual(booking.patient.first_name, 'Haji')
        self.assertEqual(booking.patient.last_name, 'Muhammad')

    # ── Test 2: requested_item parsed from notes ──────────────────────────────
    def test_requested_item_parsed_from_notes(self):
        url = '/api/bookings/public/'
        payload = {
            'patient_name': 'Zainab Bibi',
            'phone': '03219876543',
            'service_type': 'short_service',
            'notes': 'Requested service: Wound dressing\nPatient had gallbladder surgery.',
            'address': 'Sector G-9/2, Islamabad',
        }
        res = self.client.post(url, data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        booking = Booking.objects.get(reference_code=res.data['booking_reference'])
        self.assertEqual(booking.requested_item, 'Wound dressing')

        # Also verify CRM Lead received the requested_item
        lead = Lead.objects.filter(converted_booking=booking).first()
        self.assertIsNotNone(lead)
        self.assertEqual(lead.requested_item, 'Wound dressing')

    # ── Test 3: Client-sent price ignored (computed server-side from catalogue)
    def test_client_sent_price_ignored(self):
        url = '/api/bookings/public/'
        payload = {
            'patient_name': 'Ali Raza',
            'phone': '03331122334',
            'service_type': 'doctors',
            'requested_item': 'Online Specialist',
            'notes': 'Requested service: Online Specialist',
            'amount': '999999.00',  # Spoofed client price
            'price': '888888.00',
            'address': 'Islamabad',
        }
        res = self.client.post(url, data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        booking = Booking.objects.get(reference_code=res.data['booking_reference'])
        # The catalogue price for Online Specialist is PKR 3,500
        self.assertEqual(booking.estimated_price, Decimal('3500.00'))
        self.assertEqual(booking.amount, Decimal('3500.00'))
        self.assertNotEqual(booking.amount, Decimal('999999.00'))

    # ── Test 4: New service_types accepted ────────────────────────────────────
    def test_new_service_types_accepted(self):
        new_types = ['lab_test', 'equipment_rental', 'psychology', 'nutrition', 'baby_sitter']
        url = '/api/bookings/public/'

        for st in new_types:
            cache.clear()
            payload = {
                'patient_name': f'Test Patient {st}',
                'phone': '03005554433',
                'service_type': st,
                'address': 'PWD Islamabad',
            }
            res = self.client.post(url, data=payload, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"Failed for {st}: {res.data}")
            booking = Booking.objects.get(reference_code=res.data['booking_reference'])
            self.assertEqual(booking.service_type, st)

    # ── Test 5: Invalid service_type rejected ─────────────────────────────────
    def test_invalid_service_type_rejected(self):
        url = '/api/bookings/public/'
        payload = {
            'patient_name': 'Bad Request Patient',
            'phone': '03005554433',
            'service_type': 'unsupported_malicious_type',
            'address': 'Islamabad',
        }
        res = self.client.post(url, data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', res.data)
        self.assertIn('Invalid service_type', res.data['error'])

    # ── Test 6: Authenticated catalogue endpoint ──────────────────────────────
    def test_authenticated_catalog_endpoint(self):
        self.client.force_authenticate(user=self.staff_user)
        res = self.client.get('/api/services/catalog/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        self.assertGreater(len(results), 0)
        first = results[0]
        # Should include internal fields like sort_order and is_active
        self.assertIn('sort_order', first)
        self.assertIn('is_active', first)
        self.assertIn('category_display', first)

    # ── Test 7: Public read-only catalogue endpoint (AllowAny, throttled, no internal fields)
    def test_public_catalog_endpoint(self):
        self.client.logout()
        res = self.client.get('/api/services/catalog/public/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items = res.data
        self.assertIsInstance(items, list)
        self.assertGreater(len(items), 0)
        first = items[0]
        # Should have public fields
        self.assertIn('id', first)
        self.assertIn('name', first)
        self.assertIn('category', first)
        self.assertIn('price_min', first)
        self.assertIn('price_text', first)
        # Should NOT expose internal fields
        self.assertNotIn('sort_order', first)
        self.assertNotIn('is_active', first)
        self.assertNotIn('created_at', first)
        self.assertNotIn('updated_at', first)

    # ── Test 8: Invoice takes line items from catalogue and stays editable ───
    def test_invoice_takes_line_items_from_catalogue(self):
        patient = Patient.objects.create(
            mr_number='MR-2026-9999',
            first_name='Fatima',
            last_name='Sultana',
            date_of_birth='1965-01-01',
            gender='F',
            phone='03001234567',
            address='Islamabad',
            primary_diagnosis='Post-op care',
        )
        booking = Booking.objects.create(
            patient=patient,
            service_type='equipment_rental',
            requested_item='electric hospital bed',
            scheduled_time='2026-10-25 12:00:00Z',
            estimated_price=Decimal('25000.00'),
            amount=Decimal('25000.00'),
        )
        invoice = generate_invoice_for_booking(booking)
        self.assertEqual(invoice.patient, patient)
        self.assertEqual(invoice.line_items.count(), 1)
        line_item = invoice.line_items.first()
        self.assertIn('electric hospital bed', line_item.description.lower())
        self.assertEqual(line_item.unit_price, Decimal('25000.00'))

        # Line items stay editable:
        line_item.unit_price = Decimal('27000.00')
        line_item.save()
        line_item.refresh_from_db()
        self.assertEqual(line_item.unit_price, Decimal('27000.00'))

    # ── Test 9: Exact Name Matching from Mobile App Notes ────────────────────
    def test_exact_name_matching_from_mobile_notes(self):
        """
        Mobile app sends notes: 'Requested service: <exact name>'
        Verify that compute_catalog_price and POST /api/bookings/public/ resolve every exact name.
        """
        exact_services = [
            ("Online consultation, Specialist", "doctors", Decimal("3500.00")),
            ("Online consultation, Medical Officer", "doctors", Decimal("2000.00")),
            ("Home visit, Specialist", "doctors", Decimal("5000.00")),
            ("Home visit, Medical Officer", "doctors", Decimal("3000.00")),
            ("Follow-up consultation", "doctors", None),
            ("IV/IM/SC/intradermal injections", "short_service", Decimal("2000.00")),
            ("IV cannulation and IV therapy", "short_service", Decimal("2500.00")),
            ("Stitch removal", "short_service", Decimal("2000.00")),
            ("Wound dressing and care", "short_service", Decimal("1500.00")),
            ("NG tube insertion and care", "short_service", Decimal("5000.00")),
            ("Urinary catheter insertion and care", "short_service", Decimal("5000.00")),
            ("Suctioning", "short_service", Decimal("2500.00")),
            ("Nebulization", "short_service", Decimal("2000.00")),
            ("Colostomy bag change and care", "short_service", Decimal("3000.00")),
            ("Tracheostomy care and tube change", "short_service", Decimal("10000.00")),
            ("Staff retaining time after one hour", "short_service", Decimal("750.00")),
            ("POP removal", "short_service", Decimal("2500.00")),
            ("Enema insertion", "short_service", Decimal("2500.00")),
            ("Suprapubic catheter insertion", "short_service", Decimal("10000.00")),
            ("PEG tube replacement", "short_service", Decimal("25000.00")),
            ("Home physiotherapy session", "physiotherapy", Decimal("3000.00")),
            ("Home speech and language therapy / stroke rehabilitation", "physiotherapy", Decimal("3500.00")),
            ("Online physiotherapy consultation", "physiotherapy", Decimal("2000.00")),
            ("Blood sample collection", "lab_test", Decimal("1500.00")),
            ("Arterial blood sample", "lab_test", Decimal("3000.00")),
            ("Urine sample collection", "lab_test", Decimal("5000.00")),
            ("Urine sample collection (with catheter insertion)", "lab_test", Decimal("5000.00")),
            ("ECG at home", "lab_test", Decimal("5000.00")),
            ("sleep study / Holter", "lab_test", Decimal("15000.00")),
            ("Electric hospital bed (5- and 7-function)", "equipment_rental", Decimal("25000.00")),
            ("Manual hospital bed", "equipment_rental", Decimal("15000.00")),
            ("air mattress", "equipment_rental", Decimal("2000.00")),
            ("oxygen cylinder", "equipment_rental", Decimal("3000.00")),
            ("oxygen concentrator 5 litres", "equipment_rental", Decimal("15000.00")),
            ("oxygen concentrator 10 litres", "equipment_rental", Decimal("25000.00")),
            ("nebulizer", "equipment_rental", Decimal("1500.00")),
            ("IV pole and stand", "equipment_rental", Decimal("1000.00")),
            ("cardiac monitor", "equipment_rental", Decimal("15000.00")),
            ("BiPAP", "equipment_rental", Decimal("15000.00")),
            ("suction machine", "equipment_rental", Decimal("3000.00")),
            ("12 hour shift", "baby_sitter", Decimal("120000.00")),
            ("24 hour shift", "baby_sitter", Decimal("160000.00")),
        ]

        for exact_name, service_type, expected_price in exact_services:
            # 1. Test direct compute_catalog_price resolution
            price = compute_catalog_price(service_type=service_type, requested_item=exact_name)
            self.assertEqual(
                price, expected_price,
                f"compute_catalog_price failed for '{exact_name}' with service_type='{service_type}'. Got {price}, expected {expected_price}"
            )

            # 2. Test via public booking endpoint with notes='Requested service: <exact name>'
            cache.clear()
            url = '/api/bookings/public/'
            payload = {
                'patient_name': f'Patient {exact_name[:12]}',
                'phone': '03001234567',
                'service_type': service_type,
                'notes': f'Requested service: {exact_name}\nAdditional patient instructions',
                'address': 'Islamabad',
            }
            res = self.client.post(url, data=payload, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"Public booking failed for '{exact_name}': {res.data}")
            booking = Booking.objects.get(reference_code=res.data['booking_reference'])
            self.assertEqual(booking.requested_item, exact_name)
            self.assertEqual(
                booking.estimated_price, expected_price,
                f"Booking estimated_price mismatch for '{exact_name}'. Got {booking.estimated_price}, expected {expected_price}"
            )

    # ── Test 10: Ambiguous Names Disambiguation by service_type ──────────────
    def test_ambiguous_names_disambiguated_by_service_type(self):
        """
        Names like 'Online session', 'Home consultation', and 'In-person or home visit'
        must resolve to the correct category based on booking service_type.
        If service_type does not match or is ambiguous, must return None.
        """
        # 'Online session'
        self.assertEqual(compute_catalog_price("psychology", "Online session"), Decimal("3000.00"))
        self.assertEqual(compute_catalog_price("nutrition", "Online session"), Decimal("2500.00"))
        self.assertEqual(compute_catalog_price("physiotherapy", "Online session"), Decimal("2000.00"))
        self.assertIsNone(compute_catalog_price("short_service", "Online session"))
        self.assertIsNone(compute_catalog_price("", "Online session"))

        # 'In-person or home visit'
        self.assertEqual(compute_catalog_price("psychology", "In-person or home visit"), Decimal("5000.00"))
        self.assertEqual(compute_catalog_price("nutrition", "In-person or home visit"), Decimal("5000.00"))
        self.assertEqual(compute_catalog_price("physiotherapy", "In-person or home visit"), Decimal("3000.00"))
        self.assertIsNone(compute_catalog_price("equipment_rental", "In-person or home visit"))
        self.assertIsNone(compute_catalog_price("", "In-person or home visit"))

        # 'Home consultation'
        self.assertEqual(compute_catalog_price("nutrition", "Home consultation"), Decimal("5000.00"))
        self.assertEqual(compute_catalog_price("doctors", "Home consultation"), Decimal("5000.00"))
        self.assertEqual(compute_catalog_price("psychology", "Home consultation"), Decimal("5000.00"))
        self.assertIsNone(compute_catalog_price("short_service", "Home consultation"))
        self.assertIsNone(compute_catalog_price("", "Home consultation"))

    # ── Test 11: Long Term Nursing Shift & Role Permutations ──────────────────
    def test_long_term_nursing_combinations(self):
        """
        Format: 'Long term nursing, <shift>, <role>' (legacy, defaults to per month)
        and new format: 'Long term nursing, <per month|per shift>, <shift>, <role>'
        Shifts: 8h, 12h, 24h
        Roles: Registered Nurse, Nursing Assistant, Nursing Attendant
        Not offered: 8h Attendant, 24h RN -> returns None.
        """
        ltn_cases = [
            # Legacy format (treated as per month)
            ("Long term nursing, 8h, Registered Nurse", Decimal("130000.00")),
            ("Long term nursing, 8h, Nursing Assistant", Decimal("90000.00")),
            ("Long term nursing, 8h, Nursing Attendant", None),  # Not offered
            ("Long term nursing, 12h, Registered Nurse", Decimal("160000.00")),
            ("Long term nursing, 12h, Nursing Assistant", Decimal("120000.00")),
            ("Long term nursing, 12h, Nursing Attendant", Decimal("90000.00")),
            ("Long term nursing, 24h, Registered Nurse", None),  # Not offered (old 200k dropped)
            ("Long term nursing, 24h, Nursing Assistant", Decimal("160000.00")),
            ("Long term nursing, 24h, Nursing Attendant", Decimal("130000.00")),

            # New format: Per month
            ("Long term nursing, per month, 8h, Registered Nurse", Decimal("130000.00")),
            ("Long term nursing, per month, 8h, Nursing Assistant", Decimal("90000.00")),
            ("Long term nursing, per month, 8h, Nursing Attendant", None),
            ("Long term nursing, per month, 12h, Registered Nurse", Decimal("160000.00")),
            ("Long term nursing, per month, 12h, Nursing Assistant", Decimal("120000.00")),
            ("Long term nursing, per month, 12h, Nursing Attendant", Decimal("90000.00")),
            ("Long term nursing, per month, 24h, Registered Nurse", None),
            ("Long term nursing, per month, 24h, Nursing Assistant", Decimal("160000.00")),
            ("Long term nursing, per month, 24h, Nursing Attendant", Decimal("130000.00")),

            # New format: Per shift
            ("Long term nursing, per shift, 8h, Registered Nurse", Decimal("4500.00")),
            ("Long term nursing, per shift, 8h, Nursing Assistant", Decimal("3000.00")),
            ("Long term nursing, per shift, 8h, Nursing Attendant", None),
            ("Long term nursing, per shift, 12h, Registered Nurse", Decimal("6500.00")),
            ("Long term nursing, per shift, 12h, Nursing Assistant", Decimal("4000.00")),
            ("Long term nursing, per shift, 12h, Nursing Attendant", Decimal("3000.00")),
            ("Long term nursing, per shift, 24h, Registered Nurse", None),
            ("Long term nursing, per shift, 24h, Nursing Assistant", Decimal("5500.00")),
            ("Long term nursing, per shift, 24h, Nursing Attendant", Decimal("4500.00")),
        ]

        for req_str, expected_price in ltn_cases:
            price = compute_catalog_price("long_term", req_str)
            self.assertEqual(
                price, expected_price,
                f"Failed for '{req_str}': got {price}, expected {expected_price}"
            )

            # Test via public booking endpoint
            cache.clear()
            url = '/api/bookings/public/'
            payload = {
                'patient_name': 'Patient LTN',
                'phone': '03001234567',
                'service_type': 'long_term',
                'notes': f'Requested service: {req_str}',
                'address': 'Islamabad',
            }
            res = self.client.post(url, data=payload, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            booking = Booking.objects.get(reference_code=res.data['booking_reference'])
            self.assertEqual(booking.requested_item, req_str)
            self.assertEqual(booking.estimated_price, expected_price)

    # ── Test 12: Case-insensitivity and Whitespace Trimming ───────────────────
    def test_case_insensitivity_and_trimming(self):
        trimmed_upper = compute_catalog_price("doctors", "   oNlInE CoNsUlTaTiOn, sPeCiAlIsT   ")
        self.assertEqual(trimmed_upper, Decimal("3500.00"))

        ltn_case = compute_catalog_price("long_term", "  lOnG tErM nUrSiNg, 12H, rEgIsTeReD nUrSe  ")
        self.assertEqual(ltn_case, Decimal("160000.00"))

    # ── Test 13: Unknown Names Must Leave estimated_price null (Never Guess) ──
    def test_unknown_names_leave_estimated_price_null_never_guess(self):
        unknown_services = [
            ("Brain Surgery", "doctors"),
            ("Cardiac Stenting", "doctors"),
            ("Random Nonexistent Lab Test", "lab_test"),
            ("Nuclear Medicine", "short_service"),
            ("Invalid Equipment X", "equipment_rental"),
            ("Unmatched Service String", "baby_sitter"),
        ]

        for name, st in unknown_services:
            price = compute_catalog_price(st, name)
            self.assertIsNone(price, f"Expected None for unknown service '{name}', but got {price}")

            # Verify public booking leaves estimated_price null
            cache.clear()
            url = '/api/bookings/public/'
            payload = {
                'patient_name': 'Unknown Service Patient',
                'phone': '03009998877',
                'service_type': st,
                'notes': f'Requested service: {name}\nPlease call back.',
                'address': 'Rawalpindi',
            }
            res = self.client.post(url, data=payload, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            booking = Booking.objects.get(reference_code=res.data['booking_reference'])
            self.assertEqual(booking.requested_item, name)
            self.assertIsNone(booking.estimated_price, f"Booking estimated_price must be None for '{name}'")

