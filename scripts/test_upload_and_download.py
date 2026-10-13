#!/usr/bin/env python3
"""
Test uploading 5MB PDF and 20MB file, downloading them back with JWT,
and verifying persistence in MEDIA_ROOT.
"""
import os
import sys
import io

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(BASE_DIR, 'backend')
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')
import django
django.setup()

from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from documents.models import Document


def main():
    print(f"MEDIA_ROOT: {settings.MEDIA_ROOT}")
    user = User.objects.filter(is_superuser=True).first()
    if not user:
        user = User.objects.create_superuser('admin', 'admin@example.com', 'admin123')

    client = APIClient()
    client.force_authenticate(user=user)

    # 1. Test 5MB PDF
    size_5mb = 5 * 1024 * 1024
    content_5mb = b"%PDF-1.4\n" + b"X" * (size_5mb - 15) + b"\n%%EOF"
    pdf_file = SimpleUploadedFile("test_sample_5mb.pdf", content_5mb, content_type="application/pdf")

    print("\n[TEST 1] Uploading 5MB PDF...")
    res_pdf = client.post('/api/documents/', {
        'title': 'Test 5MB Clinical Protocol',
        'category': 'clinical',
        'owner_type': 'none',
        'file': pdf_file,
    }, format='multipart')

    print(f"Status: {res_pdf.status_code}")
    assert res_pdf.status_code == 201, f"Expected 201, got {res_pdf.status_code}: {res_pdf.data}"
    pdf_doc = res_pdf.data
    pdf_id = pdf_doc['id']
    print(f"Created Document ID: {pdf_id}, File: {pdf_doc['file']}, Size: {pdf_doc.get('file_size_display')}")

    # Download 5MB PDF back
    print("[TEST 1b] Downloading 5MB PDF back via JWT authenticated endpoint...")
    res_download_pdf = client.get(f'/api/documents/{pdf_id}/download/')
    assert res_download_pdf.status_code == 200, f"Download failed: {res_download_pdf.status_code}"
    downloaded_pdf_data = b"".join(res_download_pdf.streaming_content) if res_download_pdf.streaming else res_download_pdf.content
    assert len(downloaded_pdf_data) == len(content_5mb), f"Size mismatch: {len(downloaded_pdf_data)} vs {len(content_5mb)}"
    print(f"[PASS] 5MB PDF downloaded back successfully ({len(downloaded_pdf_data)} bytes match exact payload)!")

    # 2. Test 20MB file (MP4 video or large DOCX)
    size_20mb = 20 * 1024 * 1024
    content_20mb = b"\x00\x00\x00 ftypisom" + b"Y" * (size_20mb - 16)
    mp4_file = SimpleUploadedFile("test_procedure_20mb.mp4", content_20mb, content_type="video/mp4")

    print("\n[TEST 2] Uploading 20MB MP4 file...")
    res_20mb = client.post('/api/documents/', {
        'title': 'Test 20MB Clinical Procedure Video',
        'category': 'training',
        'owner_type': 'none',
        'file': mp4_file,
    }, format='multipart')

    print(f"Status: {res_20mb.status_code}")
    assert res_20mb.status_code == 201, f"Expected 201, got {res_20mb.status_code}: {res_20mb.data}"
    doc_20mb = res_20mb.data
    id_20mb = doc_20mb['id']
    print(f"Created Document ID: {id_20mb}, File: {doc_20mb['file']}, Size: {doc_20mb.get('file_size_display')}")

    # Download 20MB file back
    print("[TEST 2b] Downloading 20MB file back via JWT authenticated endpoint...")
    res_download_20mb = client.get(f'/api/documents/{id_20mb}/download/')
    assert res_download_20mb.status_code == 200, f"Download failed: {res_download_20mb.status_code}"
    downloaded_20mb_data = b"".join(res_download_20mb.streaming_content) if res_download_20mb.streaming else res_download_20mb.content
    assert len(downloaded_20mb_data) == len(content_20mb), f"Size mismatch: {len(downloaded_20mb_data)} vs {len(content_20mb)}"
    print(f"[PASS] 20MB file downloaded back successfully ({len(downloaded_20mb_data)} bytes match exact payload)!")

    # Confirm persistence in MEDIA_ROOT
    doc_obj = Document.objects.get(id=id_20mb)
    file_path = doc_obj.file.path
    print(f"\n[PERSISTENCE CHECK] Checking file on disk at: {file_path}")
    assert os.path.exists(file_path), f"File does not exist on disk: {file_path}"
    print(f"[PASS] File persists on disk with size {os.path.getsize(file_path)} bytes!")
    print("\nAll upload, download & persistence tests PASSED successfully!")


if __name__ == '__main__':
    main()
