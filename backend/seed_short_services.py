import os
import django
import random
from datetime import date, timedelta
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from patients.models import Patient
from staff.models import StaffMember
from pharmacy.models import Medicine, MedicineOrder, MedicineOrderItem, MedicineCategory, MedicineOrderStatus, MedicinePaymentStatus
from equipment.models import EquipmentItem, EquipmentRental, EquipmentRentalStatus
from lab.models import LabTest, LabOrder, LabReport, LabOrderStatus

def seed_data():
    print("--- Seeding Pharmacy, Equipment, & Lab Data ---")
    
    # 1. Medicines
    medicines = [
        {"name": "Augmentin 625mg", "generic_name": "Amoxicillin + Clavulanate", "requires_prescription": True, "unit_price": 540.00, "stock_quantity": 45, "category": MedicineCategory.ANTIBIOTICS, "strength": "625mg", "dosage_form": "Tablet"},
        {"name": "Panadol Extra", "generic_name": "Paracetamol + Caffeine", "requires_prescription": False, "unit_price": 60.00, "stock_quantity": 180, "category": MedicineCategory.ANALGESICS, "strength": "500mg", "dosage_form": "Tablet"},
        {"name": "Concor 5mg", "generic_name": "Bisoprolol Fumarate", "requires_prescription": True, "unit_price": 420.00, "stock_quantity": 28, "category": MedicineCategory.CARDIAC, "strength": "5mg", "dosage_form": "Tablet"},
        {"name": "Glucophage 500mg", "generic_name": "Metformin HCl", "requires_prescription": True, "unit_price": 210.00, "stock_quantity": 60, "category": MedicineCategory.DIABETES, "strength": "500mg", "dosage_form": "Tablet"},
        {"name": "Ventolin Inhaler", "generic_name": "Salbutamol", "requires_prescription": True, "unit_price": 680.00, "stock_quantity": 12, "category": MedicineCategory.RESPIRATORY, "strength": "100mcg", "dosage_form": "Inhaler"},
        {"name": "Nexum 40mg", "generic_name": "Esomeprazole", "requires_prescription": False, "unit_price": 380.00, "stock_quantity": 75, "category": MedicineCategory.GASTRO, "strength": "40mg", "dosage_form": "Capsule"},
        {"name": "Surbex-Z", "generic_name": "Zinc + Vitamin B-Complex + C", "requires_prescription": False, "unit_price": 320.00, "stock_quantity": 90, "category": MedicineCategory.VITAMINS, "strength": "High Potency", "dosage_form": "Tablet"},
        {"name": "Lopressor 50mg", "generic_name": "Metoprolol Tartrate", "requires_prescription": True, "unit_price": 310.00, "stock_quantity": 8, "category": MedicineCategory.CARDIAC, "strength": "50mg", "dosage_form": "Tablet"}, # Low stock test
        {"name": "Brufen 400mg", "generic_name": "Ibuprofen", "requires_prescription": False, "unit_price": 120.00, "stock_quantity": 110, "category": MedicineCategory.ANALGESICS, "strength": "400mg", "dosage_form": "Tablet"},
        {"name": "Cravit 500mg", "generic_name": "Levofloxacin", "requires_prescription": True, "unit_price": 890.00, "stock_quantity": 22, "category": MedicineCategory.ANTIBIOTICS, "strength": "500mg", "dosage_form": "Tablet"},
    ]
    created_meds = []
    for m in medicines:
        med, _ = Medicine.objects.update_or_create(name=m['name'], defaults=m)
        created_meds.append(med)
    print(f"Seeded {len(created_meds)} medicines.")

    # 2. Equipment Items
    equipment = [
        {"name": "Foldable Wheelchair (Chrome)", "description": "High-durability stainless steel wheelchair with detachable footrests and cushion.", "category": "Mobility Support", "daily_rate": 250.00, "weekly_rate": 1400.00, "monthly_rate": 4500.00, "security_deposit": 5000.00, "total_units": 8, "available_units": 6},
        {"name": "5L Medical Oxygen Concentrator", "description": "Continuous high-flow 93% pure oxygen supply with nebulizer outlet and alarms.", "category": "Respiratory Care", "daily_rate": 800.00, "weekly_rate": 4500.00, "monthly_rate": 15000.00, "security_deposit": 25000.00, "total_units": 6, "available_units": 3},
        {"name": "Electric ICU Hospital Bed (3 Functions)", "description": "Motorized height, backrest and knee break adjustment with side guardrails and mattress.", "category": "Hospital at Home ICU", "daily_rate": 1200.00, "weekly_rate": 7000.00, "monthly_rate": 22000.00, "security_deposit": 30000.00, "total_units": 4, "available_units": 2},
        {"name": "Anti-Bedsore Ripple Air Mattress", "description": "Alternating pressure bubble mattress system with silent heavy-duty pump.", "category": "Pressure Care", "daily_rate": 180.00, "weekly_rate": 1000.00, "monthly_rate": 3200.00, "security_deposit": 3500.00, "total_units": 10, "available_units": 7},
        {"name": "Electric Suction Machine", "description": "High vacuum suction unit with dual glass jars for tracheostomy and airway clearance.", "category": "Clinical Suction", "daily_rate": 350.00, "weekly_rate": 2000.00, "monthly_rate": 6500.00, "security_deposit": 8000.00, "total_units": 5, "available_units": 1}, # Low availability test
        {"name": "Digital Patient Vital Signs Monitor", "description": "Multi-parameter monitor for SpO2, NIBP, Pulse, and Temp with continuous audible alarm.", "category": "Diagnostic Monitoring", "daily_rate": 600.00, "weekly_rate": 3500.00, "monthly_rate": 11000.00, "security_deposit": 20000.00, "total_units": 5, "available_units": 4},
    ]
    created_eq = []
    for eq_data in equipment:
        eq, _ = EquipmentItem.objects.update_or_create(name=eq_data['name'], defaults=eq_data)
        created_eq.append(eq)
    print(f"Seeded {len(created_eq)} equipment items.")

    # 3. Lab Tests
    lab_tests = [
        {"name": "Complete Blood Count (CBC)", "price": 850.00, "sample_type": "Blood (EDTA)", "turnaround_hours": 12, "description": "Assesses red blood cells, white blood cells, hemoglobin, and platelets.", "preparation_instructions": "No specific fasting required."},
        {"name": "Fasting Blood Sugar (FBS)", "price": 400.00, "sample_type": "Blood (Fluoride)", "turnaround_hours": 6, "description": "Measures blood glucose levels after fasting.", "preparation_instructions": "Strict 8 to 10 hours overnight fasting required."},
        {"name": "HbA1c (Glycated Hemoglobin)", "price": 1400.00, "sample_type": "Blood (EDTA)", "turnaround_hours": 12, "description": "Reflects average blood sugar control over the past 3 months.", "preparation_instructions": "Fasting not required."},
        {"name": "Liver Function Tests (LFT)", "price": 1650.00, "sample_type": "Blood (Serum)", "turnaround_hours": 18, "description": "Bilirubin, ALT, AST, Alkaline Phosphatase, Total Protein, and Albumin.", "preparation_instructions": "Overnight fasting recommended."},
        {"name": "Renal Function Tests (RFT / Urea & Creatinine)", "price": 1200.00, "sample_type": "Blood (Serum)", "turnaround_hours": 12, "description": "Evaluates kidney function via serum creatinine and blood urea.", "preparation_instructions": "Standard hydration."},
        {"name": "Lipid Profile Panel", "price": 1800.00, "sample_type": "Blood (Serum)", "turnaround_hours": 18, "description": "Total Cholesterol, Triglycerides, HDL, LDL, and VLDL fractions.", "preparation_instructions": "10-12 hours strict fasting required."},
        {"name": "Urine Routine Examination (R/E)", "price": 500.00, "sample_type": "Urine (Clean Catch)", "turnaround_hours": 6, "description": "Physical, chemical, and microscopic examination for infection and renal disease.", "preparation_instructions": "First morning mid-stream clean catch specimen preferred."},
        {"name": "Thyroid Profile (TSH, FT3, FT4)", "price": 2800.00, "sample_type": "Blood (Serum)", "turnaround_hours": 24, "description": "Comprehensive thyroid function evaluation.", "preparation_instructions": "Fasting not strictly required."},
        {"name": "Serum Electrolytes (Na+, K+, Cl-)", "price": 1100.00, "sample_type": "Blood (Serum)", "turnaround_hours": 8, "description": "Measures essential electrolytes to monitor dehydration and cardiac status.", "preparation_instructions": "No fasting needed."},
    ]
    created_tests = []
    for t_data in lab_tests:
        test, _ = LabTest.objects.update_or_create(name=t_data['name'], defaults=t_data)
        created_tests.append(test)
    print(f"Seeded {len(created_tests)} lab tests.")

    # 4. Sample Orders & Rentals
    patients = list(Patient.objects.all()[:4])
    staff_members = list(StaffMember.objects.all()[:4])
    if not patients:
        print("No patients found in DB, skipping sample orders.")
        return

    delivery_rider = staff_members[0] if staff_members else None
    technician = staff_members[1] if len(staff_members) > 1 else delivery_rider

    # Sample Medicine Orders
    order1, _ = MedicineOrder.objects.get_or_create(
        patient=patients[0],
        delivery_address="House 42, Street 8, F-7/2, Islamabad",
        defaults={
            'status': MedicineOrderStatus.OUT_FOR_DELIVERY,
            'delivery_staff': delivery_rider,
            'total_amount': 960.00,
            'payment_status': MedicinePaymentStatus.COD,
            'notes': 'Urgent delivery for cardiac medication',
        }
    )
    if not order1.items.exists():
        MedicineOrderItem.objects.create(order=order1, medicine=created_meds[2], quantity=2, price_at_order=420.00) # Concor
        MedicineOrderItem.objects.create(order=order1, medicine=created_meds[1], quantity=2, price_at_order=60.00) # Panadol
        order1.calculate_total()

    order2, _ = MedicineOrder.objects.get_or_create(
        patient=patients[1] if len(patients) > 1 else patients[0],
        delivery_address="Flat 4B, Silver Oak Apartments, E-11, Islamabad",
        defaults={
            'status': MedicineOrderStatus.PENDING,
            'total_amount': 540.00,
            'payment_status': MedicinePaymentStatus.UNPAID,
            'notes': 'Waiting for prescription confirmation',
        }
    )
    if not order2.items.exists():
        MedicineOrderItem.objects.create(order=order2, medicine=created_meds[0], quantity=1, price_at_order=540.00) # Augmentin
        order2.calculate_total()

    # Sample Equipment Rentals
    rental1, _ = EquipmentRental.objects.get_or_create(
        patient=patients[0],
        equipment=created_eq[1], # Oxygen Concentrator
        defaults={
            'rental_start': date.today() - timedelta(days=3),
            'rental_end': date.today() + timedelta(days=11),
            'status': EquipmentRentalStatus.ACTIVE,
            'delivery_staff': delivery_rider,
            'deposit_amount': 25000.00,
            'deposit_refunded': False,
            'rental_rate_type': 'weekly',
            'total_rental_fee': 9000.00,
            'delivery_address': 'House 42, Street 8, F-7/2, Islamabad',
            'delivered_at': timezone.now() - timedelta(days=3),
        }
    )

    rental2, _ = EquipmentRental.objects.get_or_create(
        patient=patients[1] if len(patients) > 1 else patients[0],
        equipment=created_eq[0], # Wheelchair
        defaults={
            'rental_start': date.today(),
            'rental_end': date.today() + timedelta(days=7),
            'status': EquipmentRentalStatus.REQUESTED,
            'deposit_amount': 5000.00,
            'deposit_refunded': False,
            'rental_rate_type': 'weekly',
            'total_rental_fee': 1400.00,
            'delivery_address': 'Flat 4B, Silver Oak Apartments, E-11, Islamabad',
        }
    )

    # Sample Lab Orders
    lab_order1, _ = LabOrder.objects.get_or_create(
        patient=patients[0],
        scheduled_collection_time=timezone.now() + timedelta(hours=3),
        defaults={
            'status': LabOrderStatus.COLLECTOR_ASSIGNED,
            'collection_staff': technician,
            'collection_address': 'House 42, Street 8, F-7/2, Islamabad',
            'fasting_required': True,
            'notes': 'Patient is fasting since 10 PM last night.',
        }
    )
    if not lab_order1.tests.exists():
        lab_order1.tests.set([created_tests[0], created_tests[1], created_tests[4]]) # CBC, FBS, RFT
        lab_order1.calculate_total()

    # Sample Lab Order with Report Ready
    lab_order2, _ = LabOrder.objects.get_or_create(
        patient=patients[1] if len(patients) > 1 else patients[0],
        scheduled_collection_time=timezone.now() - timedelta(days=1),
        defaults={
            'status': LabOrderStatus.REPORT_READY,
            'collection_staff': technician,
            'collected_at': timezone.now() - timedelta(days=1),
            'collection_address': 'Flat 4B, Silver Oak Apartments, E-11, Islamabad',
            'fasting_required': False,
        }
    )
    if not lab_order2.tests.exists():
        lab_order2.tests.set([created_tests[0]]) # CBC
        lab_order2.calculate_total()
        LabReport.objects.get_or_create(
            lab_order=lab_order2,
            defaults={
                'result_data': {
                    'Hemoglobin': '13.8 g/dL (Normal 12.0 - 15.5)',
                    'WBC Count': '7,200 /mcL (Normal 4,500 - 11,000)',
                    'Platelets': '245,000 /mcL (Normal 150,000 - 450,000)',
                    'Hematocrit': '41.2% (Normal 37.0 - 48.0%)'
                },
                'flagged_abnormal': False,
                'clinical_remarks': 'Blood counts are within normal reference ranges. No signs of active infection or anemia.'
            }
        )

    print("--- Seeding Completed Successfully! ---")

if __name__ == '__main__':
    seed_data()
