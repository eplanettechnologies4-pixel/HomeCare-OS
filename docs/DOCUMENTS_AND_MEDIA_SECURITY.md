# Documents API and Protected Media

## Access Control (`backend/documents/access.py`)
- `admin` / `super_admin`: full access across all `Document` types (including `?archived=true` / `?archived=all`).
- `owner_type='patient'`: gated through `check_clinician_patient_access` + `PATIENT_FILE_PIN_REQUIRED` lock for field clinical roles (`FIELD_PIN_ROLES`); `enforce_clinical_write_permission(..., 'patient_documents')` for non-admin writes (trainees blocked, assigned patients only). `patient_family` may read only documents belonging to their own `portal_user` patient. `accountant`, `crm_executive`, and `lab_tech` are denied (`404`).
- `owner_type='staff'`: owning `StaffMember` and `admin`/`super_admin` only.
- `owner_type='course'`: follows LMS rules (`is_lms_manager` or `CourseAssignment` for that staff user).
- `owner_type='general'`: authenticated internal staff may read; only `admin`/`super_admin` may create, update, or archive.

## Non-Destructive Archive
- `DELETE /api/documents/<id>/` and `POST /api/documents/<id>/archive/` do not delete DB rows or disk files.
- Requires `admin`/`super_admin` and a mandatory `reason`. Sets `is_archived=True`, `archived_by`, `archived_at`, `archive_reason`, and writes an `AuditLog` entry.

## Short-Lived Signed Download Links & Mobile Cutover
- `POST /api/documents/<id>/download-link/` returns a `TimestampSigner(salt='document-download-link')` URL valid for 60 seconds, bound to the requesting user ID and document ID (`/api/documents/<id>/download/?dl=...`).
- `GET /api/documents/<id>/download/` accepts:
  - Normal `Authorization: Bearer <access_token>` header, OR
  - Short-lived signed `?dl=` token (same user & document, within 60s).
- Legacy `?token=<JWT>` query parameter is controlled by `DOCUMENT_LEGACY_QUERY_TOKEN` (default `True` for mobile backward compatibility; logs a deprecation warning without the token value).
- **Turning off legacy query tokens after mobile updates**: set `DOCUMENT_LEGACY_QUERY_TOKEN=False` in the environment once mobile clients call `POST /api/documents/<id>/download-link/` or send `Authorization` headers.

## Protected Media Routes (`backend/homecareOS/urls.py`)
- `/media/documents/<filepath>` -> `ProtectedDocumentMediaView` (enforces `check_document_read_access`).
- `/media/staff_id_cards/<filepath>` & `/media/id_cards/<filepath>` -> `ProtectedIdCardMediaView` (admin, super_admin, and owning `StaffMember` only).
- `StaffMember.photo` (`/media/staff_photos/...`) remains public for directory/card UI compatibility.

## Clinical Media Signed URLs (`backend/documents/signed_media.py`)
- **Setting (`backend/homecareOS/settings.py`)**: `MEDIA_SIGNED_URL_SECONDS` (env `MEDIA_SIGNED_URL_SECONDS`, default `600`, PROVISIONAL).
- **Protected Prefixes**:
  - `prescriptions/` (includes `prescriptions/orders/`): `Booking.prescription_attachment`, `Prescription.document`, `MedicineOrder.prescription_file`
  - `labs/`: `LabResult.document`
  - `lab_reports/`: `LabReport.result_file`
  - `report_photos/`: `ReportPhoto.image`
  - `patient_photos/`: `Patient.photo`
  - `certifications/`: `Certification.document`
- **Scheme**: `SignedMediaFileField` / `build_signed_media_url` signs `<user_id>:<rel_path>` via `django.core.signing.TimestampSigner(salt='clinical-media-url')` and appends `?sig=<token>` to `/media/<rel_path>`.
- **Verification**: `ProtectedClinicalMediaView` authenticates via `?sig=` (bound to user ID and path, valid for `MEDIA_SIGNED_URL_SECONDS`) OR `Authorization` header BEFORE touching disk, then re-checks permissions against the owning model row at fetch time (`check_clinician_patient_access` + PIN lock, `patient_family` own patient, `lab_tech` on labs, owning staff on certifications, admin/super_admin always).
- **Guidance for Web and Mobile Clients**:
  - Always use the file/image URL **exactly** as returned by the API (including the `?sig=` query parameter).
  - Signed URLs expire after `MEDIA_SIGNED_URL_SECONDS` (default 600s); refetch the parent API record to obtain a fresh URL.

