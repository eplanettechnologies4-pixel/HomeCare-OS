# Current End-to-End Flow: New Patient to Nurse Duty

*(Report-only audit of the codebase as it exists today. Every file path, symbol, route, model, and line reference below was directly observed in the repository.)*

---

## 1. One-Page Summary (Plain Language)

Today, getting a new patient onto a nurse's active duty is split across **two disconnected data models** — **`Booking`** (used for visits, patient file access, `My Patients`, and `Start Visit`) and **`RosterAssignment`** (used for `My Roster`, shift windows, and `Start Visit`'s duty-window check) — plus a third link on **`Patient.assigned_care_manager`** for care managers.

Because those models were built separately, most admin screens only write to **one** of them:
- **Adding a patient** via the Admin **Add Patient** modal creates a `Patient`, immediately creates a `pending` `Booking` (with no nurse assigned), and optionally creates a `patient_family` login. Public intake (`/api/bookings/public/`) creates a `Patient`, a `pending` `Booking`, and a CRM `Lead`.
- **Assigning staff on a Booking** (Bookings page) or via **Assign Patient** (Staff Directory) writes to `Booking` (`assigned_staff`, `backup_staff`, `supervisor`, `buddy`, `buddy_staff`, `transport_*`), which puts the patient in the nurse's **My Patients** and **Patient File access window**, **but creates no `RosterAssignment`**, so the shift does **not** appear in **My Roster** and **Start Visit** will refuse because no published duty window exists.
- **Assigning a shift on the Duty Roster Grid** (`/api/staff/roster/assign/`) creates a draft `RosterAssignment` (which must then be **Published** via `/api/staff/roster/publish/`), **but does not attach any `patients` and creates no `Booking`**, so the nurse sees a shift in **My Roster** with **no patients**, **no Patient File access**, and **cannot Start Visit**.
- Only **Schedule Duty** (`/api/staff/roster/schedule-duty/`, `ScheduleDutyModal`) writes **both** a `RosterAssignment` (with `patients` M2M, supervisor, driver, pickup time, buddy, overnight support) **and** a `Booking` per patient in one transaction — **however**, it is hidden inside the Staff Directory, creates a *new* `Booking` instead of linking an existing `pending` intake `Booking` (potentially leaving a duplicate `pending` booking), and rejects the save if the nurse already has an overlapping `Booking` or `RosterAssignment` on that date.

---

## 2. Text Flow Diagram of the Current Flow

```text
[1. PATIENT ENTERS SYSTEM]
  ├─ Admin AddPatientModal ──► POST /api/patients/ ──► Patient (is_active=True, source='admin_dashboard')
  │                        └─► POST /api/bookings/ ──► Booking (status='pending', assigned_staff=None)
  │                        └─► POST /api/patients/{id}/create_portal_user/ (optional) ──► User + UserProfile ('patient_family')
  ├─ Public Intake (POST /api/bookings/public/) ──► Patient + Booking (status='pending') + CRM Lead ('new_lead') + Notifications
  ├─ CRM (POST /api/crm/leads/) ──► Lead only (no Patient/Booking conversion endpoint exists)
  └─ QA Seed (manage.py seed_test_assignments --confirm) ──► Patient + Booking (status='assigned'/'in_progress')

[2. STAFF ASSIGNMENT & DUTY CREATION — 4 SEPARATE PATHS]
  ├─ Path A: Bookings Page -> Assign Staff (POST /api/bookings/{id}/assign_staff/)
  │     Writes: Booking (assigned_staff, backup_staff, supervisor, buddy_staff, transport_*)
  │     Does NOT write: RosterAssignment, Patient.assigned_care_manager
  │     Result: Shows in Nurse My Patients & Patient File, NOT in My Roster; Start Visit FAILS (no published duty window)
  │
  ├─ Path B: Staff Directory -> Assign Patient Modal (POST /api/staff/members/{id}/assign-patient/)
  │     Writes: Care Manager -> Patient.assigned_care_manager
  │             Doctor/Nurse/Therapist -> updates or creates Booking (assigned_staff or buddy/buddy_staff)
  │     Does NOT write: RosterAssignment
  │     Result: Same as Path A (Nurse sees My Patients & Patient File, NOT My Roster; Start Visit FAILS)
  │
  ├─ Path C: Staff Directory -> Duty Roster Tab (POST /api/staff/roster/assign/ + /publish/)
  │     Writes: RosterWeek + RosterAssignment (shift_name, start/end, buddy_staff, transport_*)
  │     Does NOT write: RosterAssignment.patients, Booking
  │     Result: Nurse sees shift in My Roster (after Publish) with 0 patients; NOT in My Patients or Patient File; Start Visit FAILS
  │
  └─ Path D: Staff Directory -> Schedule Duty Modal (POST /api/staff/roster/schedule-duty/)
        Writes: RosterWeek + RosterAssignment (with patients M2M, supervisor, driver, pickup_time, buddy_staff)
                + NEW Booking per patient (status='assigned', service_type='nursing')
        Does NOT update: any pre-existing 'pending' Booking from patient intake
        Result: Appears in My Roster, My Patients, Patient File access, AND Start Visit works

[3. PORTAL READS & VISIT FLOW]
  ├─ Nurse My Patients & Patient File Access ──► Reads Booking only (within 7 days; excludes cancelled)
  ├─ Nurse My Roster ──► Reads published RosterAssignment only (Today/Weekly/Monthly)
  ├─ Doctor Portal & Treating Doctor ──► Reads Booking only (within 7 days; excludes cancelled)
  ├─ Family Portal ──► Reads Patient.portal_user == request.user
  └─ Start Visit (POST /api/staff-portal/visit/start/) ──► Requires BOTH published RosterAssignment AND active Booking
```

---

## 3. Per-Step Facts (Verified Against Code)

### Step 1: How a Patient Enters the System

| Entry Path | Screen / Endpoint | Who Can Do It | Mandatory Fields | Models Created & Initial Status |
|---|---|---|---|---|
| **Admin Add Patient Modal** | `AddPatientModal.jsx` -> `POST /api/patients/` (`PatientViewSet` in `backend/patients/views.py:276`), followed automatically by `POST /api/bookings/` (`BookingViewSet` in `backend/bookings/views.py:200`) and optionally `POST /api/patients/{id}/create_portal_user/` (`backend/patients/views.py:1295`) | `Patients.jsx:37` gates button to `super_admin`, `admin`, `branch_manager`, `care_manager`. Backend `PatientViewSet` (`backend/patients/views.py:277`) allows authenticated non-family/non-trainee clinical/admin users; `create_portal_user` requires `CanManagePatientPortal` (`super_admin`, `admin`, `branch_manager`, `care_manager`, `backend/homecareOS/permissions.py:35-48`). | **Model (`Patient`, `backend/patients/models.py:52-80`)**: `first_name`, `last_name`, `date_of_birth`, `gender`, `address`, `primary_diagnosis` (`mr_number` auto-generated in `PatientDetailSerializer.create` if omitted, `backend/patients/serializers.py:208-216`). **Modal (`AddPatientModal.jsx:387-448`)**: also collects phone, emergency contact, service/shift/payment for the auto-created booking. | 1. `Patient` (`is_active=True`, `source='admin_dashboard'`, `allergy_status='not_recorded'`)<br>2. `Booking` (`status='pending'`, `payment_status='pending'` or `'advance'`)<br>3. Optional `User` + `UserProfile` (`role='patient_family'`, `status='active'`) linked to `Patient.portal_user` |
| **Public Booking Intake (Website / Mobile App)** | `POST /api/bookings/public/` (`BookingViewSet.public_booking` in `backend/bookings/views.py:545-946`) | `AllowAny` (`permission_classes=[AllowAny]`), throttled by `PublicBookingRateThrottle`, optional `X-Public-Key` header (`PUBLIC_BOOKING_API_KEY` or `MOBILE_PUBLIC_API_KEY`). | `phone` (or `patient_phone`) is strictly required (`backend/bookings/views.py:647-652`). Name, DOB/age, gender, address, diagnosis, and coordinates fall back to defaults if omitted (`lines 643-714`). | 1. `Patient` (`is_active=True`, `source='public_website'` or `'public_mobile_app'`)<br>2. `Booking` (`status='pending'`, `payment_status='pending'`)<br>3. `Lead` (`stage='new_lead'`, linked via `converted_patient` & `converted_booking`, `lines 888-901`)<br>4. `Notification` rows (`lines 904-937`) |
| **CRM Lead Intake** | `POST /api/crm/leads/` (`LeadViewSet` in `backend/crm/views.py:9-34`) | `IsCRMAllowed` (`backend/crm/views.py:10`). | Lead fields (`LeadSerializer`); **does not create a `Patient` or `Booking`** (no lead-to-patient conversion action exists in `LeadViewSet`). | `Lead` only (`stage='new_lead'` default). |
| **Family Portal** | Not available | Family users (`patient_family`) cannot create patients; `PatientViewSet.get_queryset` (`backend/patients/views.py:287-288`) filters strictly to `portal_user=user`. | N/A | None |
| **QA Seed Command** | `python manage.py seed_test_assignments --confirm` (`backend/patients/management/commands/seed_test_assignments.py:206`) | CLI / server operator | None (hardcoded QA fixtures) | `User`, `StaffMember`, `Patient`, `Booking` (`assigned`/`in_progress`), `UserProfile` (`patient_family`). |

---

### Step 2: Booking Creation, Statuses, and Staff-Linking Fields

- **Creation**:
  - Standard API: `POST /api/bookings/` (`BookingViewSet`, `backend/bookings/views.py:200`) — called by `AddPatientModal.jsx:439` and `NewBookingModal` (`Bookings.jsx:1511`).
  - Public API: `POST /api/bookings/public/` (`backend/bookings/views.py:545`).
  - Side-effect of Staff Assignment / Duty Scheduling: `StaffViewSet.assign_patient` (`backend/staff/views.py:397, 437`) and `ScheduleDutyView.post` (`backend/staff/roster_views.py:1249`).
- **Status Values** (`BookingStatus` in `backend/bookings/models.py:51-59`):
  - `pending` (default on creation/public intake)
  - `assigned` (set by `BookingViewSet.assign_staff`, `StaffViewSet.assign_patient`, `ScheduleDutyView`, `generate_recurring_bookings`)
  - `en_route`
  - `in_progress` (set by shared `transition_booking_to_in_progress` in `backend/bookings/services.py:187-197`, called from `NurseVisitStartView`, `tracking.CheckInView`, and `tracking.GPSPingView`)
  - `completed` (set by shared `transition_booking_to_completed` in `backend/bookings/services.py:200-217`, called from `NurseVisitEndView` and `tracking.CheckOutView`)
  - `cancelled`, `late`, `no_show`
- **Staff-Linking Fields on `Booking`** (`backend/bookings/models.py:98-130`):
  - `assigned_staff` (FK `StaffMember`, `related_name='bookings'`)
  - `backup_staff` (FK `StaffMember`, `related_name='backup_bookings'`)
  - `supervisor` (FK `StaffMember`, `related_name='supervised_bookings'`)
  - `buddy` (FK `StaffMember`, `related_name='buddy_bookings'`)
  - `buddy_staff` (FK `StaffMember`, `related_name='shift_buddy_bookings'`)
  - `driver` (FK `StaffMember`, `related_name='driver_duty_bookings'`) + `driver_pickup_time` (TimeField)
  - Legacy/denormalized text transport fields: `driver_name`, `driver_phone`, `pickup_time`, `transport_driver_name`, `transport_driver_phone`, `transport_pickup_time`.

---

### Step 3: Every Place Staff Can Be Assigned to a Patient

1. **Booking Assignment (`assign_staff`)**
   - **Screen / Route**: Bookings page (`frontend/src/pages/Bookings.jsx`, `useStore.js:431`) -> `POST /api/bookings/{id}/assign_staff/` (`backend/bookings/views.py:378-490`).
   - **Who may use it**: Authenticated non-family, non-nurse-unassigned users (`BookingViewSet` permissions). Trainees are blocked (`lines 390, 402, 423`).
   - **Writes**: `Booking` (`assigned_staff`, `status='assigned'`, `assigned_on`, `backup_staff`, `supervisor`, `buddy_staff`, `transport_driver_name`, `transport_driver_phone`, `transport_pickup_time`, `recurring_days`, `recurrence_end_date`, optional child `Booking`s via `generate_recurring_bookings`). Note: does **not** set `Booking.buddy` or `Booking.driver` FK.
   - **Does NOT write**: `RosterAssignment`, `RosterWeek`, `Patient.assigned_care_manager`.
   - **Portal effect**: Patient appears in Nurse `My Patients` & `Patient File` access window (if `assigned_staff` or `buddy_staff`); **does NOT appear in `My Roster`**; `Start Visit` fails if no published `RosterAssignment` exists.

2. **Assign Patient Modal (Staff Directory)**
   - **Screen / Route**: Staff Directory (`frontend/src/pages/Staff.jsx:1667`, `AssignPatientModal.jsx:63`) -> `POST /api/staff/members/{id}/assign-patient/` (`backend/staff/views.py:327-462`).
   - **Who may use it**: `super_admin`, `admin` (`lines 331-334`). Blocks trainees, inactive staff, and non-clinical roles (`accountant`, `crm_executive`, `patient_family`, `delivery_rider`).
   - **Writes**:
     - If `staff.role == 'care_manager'`: sets `Patient.assigned_care_manager = staff` (`lines 371-383`).
     - If `staff.role == 'doctor'`: updates existing `Booking` or creates new `Booking(service_type='Doctor Consultation', status='assigned')` (`lines 386-418`).
     - If `nurse` or therapist: updates existing `Booking` or creates new `Booking(status='assigned')`, setting `assigned_staff` or both `buddy` + `buddy_staff` (`lines 420-447`).
   - **Does NOT write**: `RosterAssignment` or `RosterWeek`.
   - **Portal effect**: Patient appears in Care Manager's managed patients, Doctor's treating-doctor list / Clinician Portal, or Nurse's `My Patients` & `Patient File` access window; **does NOT appear in `My Roster`**; `Start Visit` fails without a `RosterAssignment`.

3. **Schedule Duty Modal (Staff Directory)**
   - **Screen / Route**: Staff Directory (`frontend/src/pages/Staff.jsx:1697`, `ScheduleDutyModal.jsx:92`) -> `POST /api/staff/roster/schedule-duty/` (`backend/staff/roster_views.py:1045-1321`).
   - **Who may use it**: `super_admin`, `admin`, `branch_manager`, `care_manager` (`_can_schedule_duty`, `lines 1035-1042`). Blocks trainees (`line 1077`).
   - **Writes**: `RosterWeek` (`get_or_create`), `RosterAssignment` (with `shift_name`, `start_time`, `end_time`, `supervisor`, `buddy_staff`, `driver`, `driver_pickup_time`, `transport_*`, `is_published`, and `patients` M2M), **and** creates a new `Booking(service_type='nursing', status='assigned')` for every patient in `patient_ids` (`lines 1248-1266`).
   - **Does NOT write**: Does not update/consume any pre-existing `pending` `Booking` from intake; does not set `Patient.assigned_care_manager`.
   - **Portal effect**: If `is_published=True` (default), patient appears in Nurse `My Roster`, `My Patients`, `Patient File` access window, **and** `Start Visit` succeeds.

4. **Duty Roster & Scheduling Tab (Grid Cell Assign + Publish)**
   - **Screen / Route**: Staff Directory -> Duty Roster tab (`StaffRosterTab.jsx:171, 206, 274`) -> `POST /api/staff/roster/assign/` (`RosterAssignCellView`, `backend/staff/roster_views.py`), `POST /api/staff/roster/bulk/` (`RosterBulkActionView`), `POST /api/staff/roster/publish/` (`RosterPublishWeekView`).
   - **Who may use it**: `_can_edit_roster` (`RosterAssignCellView`, `RosterBulkActionView`); `_can_publish_roster` (`RosterPublishWeekView`).
   - **Writes**: `RosterWeek` (`status='draft'` on edit, `'published'` on publish) and `RosterAssignment` (`shift_name`, `start_time`, `end_time`, `buddy_staff`, `transport_driver_*`).
   - **Does NOT write**: `RosterAssignment.patients` (stays empty), `RosterAssignment.supervisor`, `RosterAssignment.driver` FK, or `Booking`.
   - **Portal effect**: After publishing, nurse sees shift hours in `My Roster` with **no patients**; patient does **not** appear in `My Patients` or `Patient File`; `Start Visit` fails.

5. **Patient Edit / Add (`assigned_care_manager`)**
   - **Screen / Route**: `AddPatientModal.jsx:383` (`POST /api/patients/`) or `PATCH /api/patients/{id}/` (`PatientDetailSerializer` in `backend/patients/serializers.py:195-201`).
   - **Writes**: `Patient.assigned_care_manager` FK. Blocks trainees (`line 197`).
   - **Does NOT write**: `Booking` or `RosterAssignment`.

6. **Django Admin Actions**
   - **Confirmed**: `backend/staff/admin.py`, `backend/patients/admin.py`, and `backend/bookings/admin.py` have **no** custom `actions = [...]` for staff/patient assignment (standard Django ModelAdmin CRUD only).

---

### Step 4: Shift / Duty Creation, Publishing, and Portal Reads

- **Roster Week & Publishing**:
  - `RosterWeek` (`backend/staff/models.py:247-262`) is keyed by `week_start_date` (always normalized to Monday) with `status` (`draft` / `published`), `revision`, `published_at`, `published_by`.
  - Editing a cell in a published week via `RosterAssignCellView` (`backend/staff/roster_views.py:481-509`) flips `RosterWeek.status` back to `draft`, bumps `revision`, and creates a draft `RosterAssignment(is_published=False)`.
  - `RosterPublishWeekView` (`backend/staff/roster_views.py:783-832`) sets `RosterWeek.status = 'published'`, deletes superseded published `RosterAssignment`s for the same `(staff, date)`, and flips draft rows to `is_published=True`.
  - **Exception**: `ScheduleDutyView` (`backend/staff/roster_views.py:1214-1227`) defaults `is_published=True` immediately without requiring a separate Publish click.
- **Shift & Overnight Storage**:
  - `RosterAssignment` (`backend/staff/models.py:279-284`) snapshots `shift_name`, `start_time`, `end_time`, `location`, `color`, `is_off`.
  - Overnight shifts are detected implicitly whenever `end_time <= start_time` (e.g., `20:00` to `08:00`) in `compute_roster_summary` (`backend/staff_portal/views.py:870, 899, 1073`), `ScheduleDutyView` (`backend/staff/roster_views.py:1117`), and `resolve_nurse_booking_for_visit` (`backend/staff_portal/visit_views.py:157`).
- **Tying Duties & Contacts**:
  - `RosterAssignment` stores `patients` (M2M `Patient`), `supervisor` (FK), `buddy_staff` (FK), `driver` (FK), `driver_pickup_time` (TimeField), and text fields `transport_driver_name`, `transport_driver_phone`, `transport_pickup_time`.
- **How Portals Read Them**:
  - **My Roster** (`compute_roster_summary`, `backend/staff_portal/views.py:850-856`): reads `RosterAssignment.objects.filter(staff=staff, is_published=True, ...)`. Ignores `Booking`. Exposes patient phone/location/Maps link and staff phones only to the owning active non-trainee nurse on a published duty inside the access window (`lines 1111-1155`).
  - **My Patients** (`StaffPortalHomeView`, `backend/staff_portal/views.py:430-434, 557-677`): reads `Booking.objects.filter(Q(assigned_staff=staff) | Q(buddy=staff))` (note: `has_booking_today` at `line 572` also checks `buddy_staff`, whereas `assigned_patient_ids` at `line 431` checks `assigned_staff` and `buddy` only). Ignores `RosterAssignment`.
  - **Patient File Access Window** (`get_assigned_patient_ids_for_user`, `backend/patients/scoping.py:45-72`): reads `Booking.objects.filter(Q(assigned_staff=staff) | Q(buddy=staff) | Q(buddy_staff=staff)).exclude(status='cancelled')` where `shift_end_time >= now - 7 days` (or `scheduled_time >= now - 7 days`, `NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT = 7`). Ignores `RosterAssignment`.
  - **Doctor Portal / Treating Doctor** (`get_assigned_patient_ids_for_clinician` & `is_treating_doctor_for_patient`, `backend/patients/scoping.py:157-193, 239-272`): reads `Booking` (plus `Patient.assigned_care_manager`) within 7 days.

---

### Step 5: What Each Role Actually Sees (Admin Action vs Where It Appears)

| Admin Action | Nurse `My Roster` | Nurse `My Patients` | Nurse `Patient File` Access (7d) | `Start Visit` Works? | Staff Directory Count (`_batch_enrich_staff_list`) | Doctor Portal / `Bookings` List |
|---|---|---|---|---|---|---|
| **Add Patient Modal** (`AddPatientModal.jsx`) | No | No | No | No | No | `Bookings` shows `pending` booking; Care Mgr sees if `assigned_care_manager` set |
| **Public Booking** (`/api/bookings/public/`) | No | No | No | No | No | `Bookings` shows `pending` booking; CRM shows `new_lead` |
| **Booking `assign_staff`** (`/api/bookings/{id}/assign_staff/`) | **No** | Yes (if `assigned_staff`; **not** if only `buddy_staff`!) | Yes (`assigned_staff` or `buddy_staff`) | **No** (no published `RosterAssignment`) | Yes (if `assigned_staff`; not `buddy_staff`) | Yes (`Bookings` & Doctor Portal if doctor) |
| **Assign Patient Modal** (`/api/staff/members/{id}/assign-patient/`) | **No** | Yes (for nurse primary/buddy) | Yes (nurse/doctor/therapist) | **No** (no published `RosterAssignment`) | Yes (counts `assigned_staff`, `buddy`, `assigned_care_manager`) | Yes (Doctor sees in Doctor Portal; CM sees managed patient) |
| **Duty Roster Grid + Publish** (`/api/staff/roster/assign/` + `/publish/`) | Yes (shift only, **0 patients**) | **No** | **No** | **No** (no `Booking`) | Today duty text shows; **assigned patient count = 0** | **No** |
| **Schedule Duty Modal** (`/api/staff/roster/schedule-duty/`) | **Yes** (with patients, supervisor, driver, buddy) | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** (creates new `nursing` `Booking`) |

---

### Step 6: Visit Flow (`Start Visit` & Unified Tracking)

- `POST /api/staff-portal/visit/start/` (`NurseVisitStartView`, `backend/staff_portal/visit_views.py:213-360`) calls `resolve_nurse_booking_for_visit` (`lines 114-210`):
  1. Finds published `RosterAssignment`s (`is_published=True`) for `staff=nurse` or `buddy_staff=nurse` within `today ± 1 day`.
  2. Finds non-cancelled, non-completed `Booking`s for `patient_id` where `assigned_staff=nurse`, `buddy=nurse`, or `buddy_staff=nurse`.
  3. Filters to bookings overlapping a published duty window (or same date), and picks the booking closest to `now`. If none match, refuses with HTTP 400 (`"No matching booking found in your published duty window for this patient."`).
- Creates both `NurseVisit` and `GeofenceEvent(CHECK_IN)` (`lines 322-350`), and transitions `Booking.status` to `in_progress` via `transition_booking_to_in_progress` (`backend/bookings/services.py:187`).
- Mobile `tracking.CheckInView` (`backend/tracking/views.py:457-500`) and `CheckOutView` (`lines 557-595`) share `NurseVisit` sync and `transition_booking_to_in_progress` / `transition_booking_to_completed` so mobile and web share one visit state.

---

### Step 7: Notifications & Audit Entries Created

| Step | Notifications (`Notification`) | Audit Entries (`AuditLog`) |
|---|---|---|
| **Public Booking** (`/api/bookings/public/`) | Created for all `super_admin`, `admin`, `crm_executive`, `is_superuser`, `is_staff` (`backend/bookings/views.py:904-937`) | None |
| **Add Patient Modal** | None | None |
| **Booking `assign_staff`** | Created for `assigned_staff.user` and `backup_staff.user` (`backend/bookings/views.py:462-488`); none for `buddy_staff` or `supervisor` | None |
| **Assign Patient Modal** | None | `log_staff_audit(actor, 'assign_patient', staff, ...)` -> `AuditLog` (`backend/staff/views.py:374, 406, 449`) |
| **Duty Roster Assign / Publish** | On Publish: `Notification` to each affected staff user (`backend/staff/roster_views.py:816-823`) | `AuditLog` `'Roster Shift Assigned'` (`line 513`) & `'Roster Published'` (`line 826`) |
| **Schedule Duty** | None | `AuditLog` `'Duty Scheduled'` (`backend/staff/roster_views.py:1268`) |

---

## 4. Analysis (A to D)

### A. Duplicates and Conflicts
1. **Booking vs RosterAssignment**: Assignment to a patient lives on `Booking` (`assigned_staff`, `buddy`, `buddy_staff`, `supervisor`, `driver`), while shift schedule lives on `RosterAssignment` (`staff`, `buddy_staff`, `supervisor`, `driver`, `patients` M2M). If an admin edits `Booking` via `assign_staff` or `AssignPatientModal`, `RosterAssignment` is untouched (and vice versa in `RosterAssignCellView`).
2. **Duplicate Buddy & Transport Fields on `Booking`**: `Booking` has *both* `buddy` AND `buddy_staff` (`backend/bookings/models.py:110-118`), and *both* `driver` FK + `driver_pickup_time` AND `driver_name`/`driver_phone`/`pickup_time` AND `transport_driver_name`/`transport_driver_phone`/`transport_pickup_time` (`lines 119-130`). Different endpoints read/write different subsets (`StaffPortalHomeView` line 431 reads `buddy`, line 572 reads `buddy | buddy_staff`; `BookingViewSet.assign_staff` writes `buddy_staff` and `transport_*` text, not `buddy` or `driver` FK).
3. **Orphaned `pending` Bookings**: `AddPatientModal` and `public_booking` always create a `pending` `Booking`. Later using `ScheduleDutyView` creates a *second* `assigned` `Booking` instead of linking the `pending` one, leaving the original `pending` booking orphaned in the Bookings queue.
4. **Unique Constraint on `RosterAssignment`**: `unique_together = ['staff', 'date', 'is_published']` (`backend/staff/models.py:316`) means a nurse can only have **one** published `RosterAssignment` per calendar date (cannot have two separate published split shifts for two different patients on the same date).

### B. Exact Sequence of Screens & Clicks Today (for 1 New Patient -> 1 Nurse Duty)
1. **Option 1 (Shortest working path — 7+ clicks, leaves orphaned `pending` booking)**:
   1. Open **Patients** -> **Add Patient** -> fill intake + service -> Save (creates `Patient` + `pending` `Booking`).
   2. Navigate to **Staff Directory** -> find nurse row -> click **Schedule Duty**.
   3. Pick **Patient**, **Date**, **Start/End Time**, optional **Supervisor / Driver + Pickup / Buddy** -> Submit (creates `RosterAssignment(is_published=True)` + a *second* `Booking(status='assigned')`).
2. **Option 2 (Intuitive path that SILENTLY FAILS)**:
   1. Open **Patients** -> **Add Patient** -> Save.
   2. Open **Bookings** -> click **Assign Staff** on the `pending` booking -> pick nurse -> Save. *(Silently fails for `My Roster` and `Start Visit` because no `RosterAssignment` exists.)*
   3. Open **Staff Directory** -> **Duty Roster** tab -> assign shift cell -> click **Publish** *(fails or overlaps if nurse already has a shift, and still doesn't link `Booking` to `RosterAssignment.patients`!).*

### C. Gaps Against the Target Flow
*Target: "Admin saves a patient, then from ONE screen picks patient(s), staff, date and shift (with overnight support), and optionally supervisor, driver with pickup time and buddy; saving once makes the patient appear in the nurse's My Roster, My Patients and patient file access, with no second step."*

- **Save a patient**: **Already works** (`AddPatientModal.jsx` / `POST /api/patients/`), though it forces creating a `pending` `Booking` at intake time.
- **From ONE screen pick patient(s), staff, date, shift (with overnight), supervisor, driver + pickup time, buddy**: **Partly works** — `ScheduleDutyModal` (`POST /api/staff/roster/schedule-duty/`) already has all of these fields and overnight support (`end_time <= start_time`), **but** it is scoped to one pre-selected nurse inside Staff Directory, does not accept/link an existing `pending` intake `Booking`, and only allows one published `RosterAssignment` per `(staff, date)`.
- **Saving once makes patient appear in My Roster, My Patients, and Patient File access with no second step**: **Partly works** — `ScheduleDutyView` achieves this when `is_published=True`, **except** `Booking.assign_staff`, `AssignPatientModal`, and `Duty Roster Grid` do not, and `ScheduleDutyView` leaves any prior `pending` intake `Booking` behind.

### D. Risks Noticed
1. **Silent Invisibility Bugs**: Assigning via `Booking.assign_staff` with `buddy_staff` only grants `Patient File` access (`scoping.py:64`) but does **not** show the patient in `StaffPortalHomeView` `assigned_patient_ids` (`views.py:431`) or `Staff` directory count (`staff/views.py:78`), and blocks `Start Visit` (no `RosterAssignment`).
2. **Unpublished Draft Trap**: Editing any cell on the Duty Roster Grid flips the entire `RosterWeek` back to `draft` (`roster_views.py:506-509`), which can confuse admins when `ScheduleDutyView` writes `is_published=True` directly.
3. **No Unified Unassign / Cancel Sync**: `StaffViewSet.unassign_patient` (`staff/views.py:464`) clears `Booking.assigned_staff`/`buddy`/`buddy_staff` or `Patient.assigned_care_manager`, **but does not remove the patient from `RosterAssignment.patients`**, so the patient can remain visible in `My Roster`.
4. **No Notification on `ScheduleDutyView` or `AssignPatientModal`**: Unlike `Booking.assign_staff` and `RosterPublishWeekView`, `ScheduleDutyView` does not create a `Notification` for the scheduled nurse.

---

## 5. Open Questions (Cannot Be Confirmed From Code Alone)

1. Should `AddPatientModal` stop auto-creating a `pending` `Booking` when a patient is saved, or should `ScheduleDutyView` consume/update an existing `pending` `Booking` instead of creating a duplicate?
2. Should a nurse be allowed to hold multiple separate published `RosterAssignment`s on the same calendar date (e.g., morning home visit for Patient A and evening visit for Patient B), which currently violates `RosterAssignment.Meta.unique_together = ['staff', 'date', 'is_published']`?
3. When a nurse is unassigned or a booking is cancelled, should `RosterAssignment.patients` be automatically updated too?
4. Should `ScheduleDuty` live on the Patients / Bookings intake flow as well as the Staff Directory?

### Options (Brief)
One option is to make **`ScheduleDuty`** (or a shared service called by both **Patients** and **Staff Directory**) the single duty-creation entry point that updates any existing `pending` `Booking` (or creates one if none exists) and writes `RosterAssignment` together, while relaxing `unique_together` on `RosterAssignment` if split shifts per day are needed; another option is to derive `My Roster` and `Start Visit` directly from `Booking` so `RosterAssignment` only tracks shift availability/off-days rather than duplicating patient links.

