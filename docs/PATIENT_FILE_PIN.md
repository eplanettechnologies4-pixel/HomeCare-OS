# Patient File Lock + Duty PIN

## Overview
When `PATIENT_FILE_PIN_REQUIRED=True`, patient clinical files are locked for field staff (`FIELD_PIN_ROLES`: `nurse`, `doctor`, `physio`, `speech`, `psychologist`, `dietician`) until unlocked with a 6-digit **Duty PIN** issued for their scheduled duty window.

Admin (`admin`), Super Admin (`super_admin`), assigned Care Manager (`care_manager`), and the patient/family portal user (`patient_family`) are unaffected. Trainees remain blocked as before.

## Environment & Settings (`backend/homecareOS/settings.py`)
- `PATIENT_FILE_PIN_REQUIRED` (env `PATIENT_FILE_PIN_REQUIRED`, default `False`)
- `DUTY_PIN_ENCRYPTION_KEY` (env `DUTY_PIN_ENCRYPTION_KEY`, Fernet base64 key; falls back to a key derived from `SECRET_KEY` with a warning log)
- `PIN_VALID_BEFORE_MINUTES = 30`
- `PATIENT_FILE_GRACE_MINUTES = 30`
- `PIN_MAX_ATTEMPTS = 5`
- `PIN_LOCKOUT_MINUTES = 15`

## Data Models (`backend/staff/models.py`)
- `DutyPIN`: Stores `pin_hash` (`make_password`), `pin_encrypted` (Fernet), `window_start`, `window_end`, `valid_from` (`window_start - 30m`), `valid_until` (`window_end + 30m`), `failed_attempts`, `locked_until`, `is_revoked`, `revoked_at`, `revoked_reason`. Raw PINs are never returned in list payloads or logs.
- `PatientFileUnlock`: Tracks an active unlock session per `(staff, patient, duty_pin)` with `expires_at` and `revoked_at`.
- `PatientFileAccessEvent`: Audit log of `pin_generated`, `pin_revealed`, `pin_regenerated`, `pin_revoked`, `unlock_success`, `unlock_failed`, `pin_locked_out`, `session_ended`.

## Endpoints
- `POST /api/patients/<pk>/unlock/` — Body `{"pin": "123456"}`. Unlocks patient file for the current duty window.
- `POST /api/patients/<pk>/lock/` — Manually locks the patient file for the current staff member.
- `GET /api/patients/<pk>/lock-status/` — Returns `{locked, unlocked, expires_at, pin_required}` (no PIN info).
- `GET /api/patients/<pk>/access-log/` — Admin/Super Admin only.
- `GET /api/staff/duty-pins/` — Admin/Super Admin only. Lists PIN metadata and status (`active`, `expired`, `revoked`, `locked_out`) without raw PINs.
- `GET /api/staff/duty-pins/<pk>/reveal/` — Admin/Super Admin only; logs `pin_revealed`.
- `POST /api/staff/duty-pins/<pk>/regenerate/` — Admin/Super Admin only; revokes old PIN & active unlock sessions.
- `POST /api/staff/duty-pins/<pk>/revoke/` — Admin/Super Admin only; revokes PIN & active unlock sessions.
- `GET /api/staff/members/<pk>/access-log/` — Admin/Super Admin only.

## Management Commands
- `python backend/manage.py generate_duty_pins [--confirm]` — Dry-run by default; `--confirm` generates DutyPINs for existing future `RosterAssignment`s and `Booking`s without touching past duties.
- `python backend/manage.py seed_test_assignments --confirm` — Also generates and prints DutyPINs for seeded TEST patients.

