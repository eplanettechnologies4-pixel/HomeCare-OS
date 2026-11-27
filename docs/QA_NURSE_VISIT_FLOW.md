# QA Checklist — Assigned Nurse Full Visit Flow

Accounts to use:
- `admin` (Admin / Super Admin)
- `nurse` (Active, non-trainee field nurse)
- `care_manager` (Care Manager)

## 1. Roster & Duty Setup
1. Log in as `admin` -> Staff Directory -> schedule a duty for `nurse` with a patient who has coordinates/address.
2. Log in as `nurse` -> My Roster -> confirm today's duty shows patient name, address, Maps link, and contact number.

## 2. Location Permission & Start Visit
1. From My Roster / My Patients, open the assigned patient's file.
2. Tap **Start Visit**.
3. Verify the UI explains why location is requested ("used once to confirm you arrived at the patient's home").
4. **Allowed & within 300m**: Visit starts, banner shows elapsed time and "In progress — location verified", booking status moves to `in_progress`.
5. **Location denied**: Visit still starts, banner shows "In progress — location not verified", `checkin_location_denied=true`.
6. **Outside 300m radius**: Visit still starts, banner shows "In progress — outside area", `checkin_outside_area=true`.

## 3. Care Actions During Visit
1. Use quick actions to **Record Vitals** (normal + abnormal), **Give Medication** (MAR), and add a **Nurse Note**.
2. Verify vitals history marks these readings with `visit_highlighted: true` and `recorded_outside_visit: false`.
3. Verify an unverified prescription is still blocked from administration even inside an active visit.
4. Verify recording vitals *without* an active visit is still accepted, with `recorded_outside_visit: true`.

## 4. End Visit & Summary
1. Tap **End Visit**, confirm, optionally enter a visit summary, and submit.
2. Verify summary counts (`vitals`, `medications`, `notes`, `duration_minutes`) match actions taken during the visit.
3. Verify booking transitions to `completed`.

## 5. Visit Log & Coordinate Privacy
1. Log in as `admin` -> `GET /api/staff-portal/visit/log/?patient_id=<id>` -> verify full check-in/out coordinates are visible.
2. Log in as `care_manager` or `doctor` -> verify visit log shows verification status (`checkin_verified`, `checkin_outside_area`) without raw GPS coordinates.
3. Verify `nurse` / `trainee` cannot access `/api/staff-portal/visit/log/` (403) and cannot start visits for unassigned patients (403).

