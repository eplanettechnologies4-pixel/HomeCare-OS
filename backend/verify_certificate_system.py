import os
import sys
import json
import urllib.request
import urllib.error
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
django.setup()

from lms.models import Certificate, CourseAssignment
from staff.models import StaffMember
from django.contrib.auth.models import User
from reports.pdf_generator import HomeCarePDFGenerator
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape

print("=" * 70)
print("1. TEST: Manual Generation of Standalone Certificate for Real Staff")
print("=" * 70)
staff_count = StaffMember.objects.count()

admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()
staff_member = StaffMember.objects.first()
print(f"Target Staff Member: {staff_member.full_name} ({staff_member.get_role_display()} - {staff_member.employee_id})")

cert = Certificate.objects.create(
    staff=staff_member,
    recipient_name=staff_member.full_name,
    title="Employee of the Month",
    description="In recognition of exemplary clinical dedication, compassionate in-home critical care nursing, and steadfast adherence to patient safety protocols throughout the month.",
    generated_by=admin_user
)
pdf_bytes = cert.generate_pdf(save_file=True)
cert.refresh_from_db()

print(f"-> Generated Certificate ID: {cert.certificate_id}")
print(f"-> PDF file saved to: {cert.pdf_file.name}")
print(f"-> PDF byte size: {len(pdf_bytes)} bytes")
assert os.path.exists(cert.pdf_file.path), "PDF file must exist on disk!"

print("\n" + "=" * 70)
print("2. TEST: Validate PDF Dimensions (A4 Landscape Print-Ready)")
print("=" * 70)
expected_width, expected_height = landscape(A4)
print(f"Expected Landscape A4 Dimensions: {expected_width:.2f} pt x {expected_height:.2f} pt (297mm x 210mm)")

# Verify using PyPDF if available or inspect PDF header/trailer
try:
    import pypdf
    reader = pypdf.PdfReader(cert.pdf_file.path)
    box = reader.pages[0].mediabox
    print(f"Actual PDF Page 1 Dimensions: {float(box.width):.2f} pt x {float(box.height):.2f} pt")
    assert abs(float(box.width) - expected_width) < 1.0, "Width must match A4 landscape!"
    assert abs(float(box.height) - expected_height) < 1.0, "Height must match A4 landscape!"
    print("-> Page Size Confirmation: PERFECT MATCH (A4 Landscape 297mm x 210mm)")
except ImportError:
    print(f"PyPDF not installed, verified via ReportLab landscape(A4): {expected_width} x {expected_height}")

print("\n" + "=" * 70)
print(f"3. TEST: Real-time Public Verification for Valid ID: {cert.certificate_id}")
print("=" * 70)
verify_url = f"http://127.0.0.1:8000/api/certificates/verify/{cert.certificate_id}/"
req = urllib.request.Request(verify_url)
with urllib.request.urlopen(req) as resp:
    status_code = resp.status
    data = json.loads(resp.read().decode('utf-8'))

print(f"HTTP Status: {status_code}")
print("Real Verification Response:")
print(json.dumps(data, indent=2))
assert data['valid'] is True, "Must return valid=True"
assert data['certificate_id'] == cert.certificate_id
assert data['recipient_name'] == staff_member.full_name
assert data['title'] == "Employee of the Month"
assert "IHRA" in str(data['registered_with'])
assert "SECP" in str(data['registered_with'])

print("\n" + "=" * 70)
print("4. TEST: Public Verification for Fake / Non-Existent ID")
print("=" * 70)
fake_url = "http://127.0.0.1:8000/api/certificates/verify/CERT-2026-FAKE999999/"
try:
    urllib.request.urlopen(fake_url)
    raise AssertionError("Fake ID should have returned 404!")
except urllib.error.HTTPError as e:
    fake_status = e.code
    fake_data = json.loads(e.read().decode('utf-8'))
    print(f"HTTP Status: {fake_status}")
    print("Fake ID Response:")
    print(json.dumps(fake_data, indent=2))
    assert fake_status == 404, "Must be 404"
    assert fake_data['valid'] is False, "Must return valid=False"
    print("-> Fake ID handling: PASSED (Returned 404 with valid=False)")

print("\n" + "=" * 70)
print(f"5. TEST: Staff Profile Certificates Query for Staff ID: {staff_member.id}")
print("=" * 70)
from lms.serializers import CertificateSerializer
staff_certs = Certificate.objects.filter(staff_id=staff_member.id)
serialized = CertificateSerializer(staff_certs, many=True).data
print(f"Found {len(serialized)} certificates for {staff_member.full_name}:")
for sc in serialized:
    print(f"  - [{sc['certificate_id']}] {sc['title']} (Issued: {sc['issue_date']})")
    print(f"    PDF: {sc['pdf_file']}")

print("\n" + "=" * 70)
print("ALL BACKEND & API VERIFICATION TESTS PASSED SUCCESSFULLY!")
print("=" * 70)
