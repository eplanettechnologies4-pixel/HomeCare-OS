# Quality Assurance Guide: Staff Portals & Patient File

**System:** eHealth Hospital at Home (HomeCare OS)  
**Roles in Scope:** Nurse, Doctor, Physiotherapist, Speech Therapist, Psychotherapist, Dietician  
**Last Updated:** November 2026 (Final Polish 2)  
**Status:** Verification Ready (NEEDS-BROWSER-TEST where noted)

---

## 1. Top Section: StaffOverviewHeader & Digital Staff ID Card

### 1.1 Shared StaffOverviewHeader Layout
- **Component:** `frontend/src/components/StaffOverviewHeader.jsx`
- **Portals Integrated:** Nurse Portal (`NurseHome.jsx`), Doctor Portal (`DoctorOverview.jsx`), Clinician Portal (`ClinicianHome.jsx`).
- **Structure:**
  1. **Slim Greeting Strip:**
     - Left: Time-sensitive greeting (`Good morning`, `Good afternoon`, `Good evening` in PKT), staff name, dynamic duty badge (`On duty`, `Upcoming shift`, `Off duty`), role title pill, date, live PKT clock.
     - Middle: Official hours chip (`09:00 – 17:00 (Asia/Karachi)` with `Open now` / `Closed` indicator).
     - Right: Live Refresh button and Emergency Helpline / Call Help button.
  2. **Top Grid (Directly below greeting strip):**
     - **Desktop (>=1024px):** 2-column grid (`5fr 7fr`).
       - Left (~5/12): Digital Staff ID Card (`StaffIdCard.jsx`).
       - Right (~7/12): Roster Card (`rosterCard` prop: "My Roster" for nurse, "Today's Roster & Duty Schedule" for doctor, "Today's Clinical Roster & Duty Window" for therapists).
     - **Tablet/Mobile (<1024px):** Stacked vertically with Digital Staff ID Card on top, followed by Roster Card. *(NEEDS-BROWSER-TEST)*

### 1.2 Digital Staff ID Card Features
- **Front Side:**
  - Employee photo, Name, Designation / Role display.
  - Employee ID (`NUR-01`, `DOC-01`, etc.), Department / Branch.
  - **Regulator check:** No "PMDC", "PNC", or regulatory claims appear in any text.
  - **Validity check:** No hard-coded expiry string (e.g. "Valid thru 12/2026"); validity reflects live status only.
- **Card Controls:**
  - **Flip Card:** Toggles between front credential and back magnetic stripe/QR code view. *(NEEDS-BROWSER-TEST)*
  - **National ID (CNIC):** Tab reveals encrypted front/back CNIC view. *(NEEDS-BROWSER-TEST)*
  - **Print Card:** High-resolution printable credential card. *(NEEDS-BROWSER-TEST)*

### 1.3 Time Left for Duty Block
- **Location:** Moved DOWN into a standalone card below the roster view (for Nurse, placed directly above the Shift Handover Notes card).
- **Behavior:**
  - `on_duty`: Active countdown timer, circular progress ring showing percentage of shift elapsed.
  - `upcoming`: Countdown timer indicating time until shift commences.
  - `off_duty`: Displays "Off duty", "No active shift", **no circular 100% progress ring or active countdown is rendered**. Never shows "Shift in progress". *(NEEDS-BROWSER-TEST)*

---

## 2. Real-Time Duty State & Clock Accuracy

### 2.1 Live Clock (Asia/Karachi Timezone)
- **Clock Format:** Standard 12-hour format with AM/PM indicator (e.g., `01:45:22 PM`, not `01:45:22 AM` at 13:45 PKT).
- **Timezone Anchor:** Synchronized to `Asia/Karachi` via shared utility `frontend/src/utils/timeFormatters.js` using `Intl.DateTimeFormat`.
- **Unit Tests:** Verified with `node --test frontend/src/utils/timeFormatters.test.js` (13:11 -> 01:11:00 PM / Good afternoon; 00:05 -> 12:05:00 AM / Good evening; 12:00 -> 12:00:00 PM / Good afternoon; 08:30 -> Good morning; 19:45 -> Good evening; date format).

---

## 3. Sidebar Navigation & Layout Consistency

### 3.1 Collapsed Icon Rail & Hover Expand
- **Default State:** Collapsed to a narrow 72px icon rail (shows only icons, tooltips, and notification dot badges).
- **Hover/Focus State:** Expands to 240px width as an overlay with ~120ms debounce timers; does NOT push or reflow main content.
- **Pin Toggle:** Pin button toggles locked 240px wide sidebar; persisted in `localStorage` inside try/catch block.
- **Keyboard Navigation:** Pressing `Escape` closes the expanded sidebar.
- **Accessibility:** All items have `aria-label` and `role="menuitem"`.
- **Mobile (<1024px):** Off-canvas drawer opened via hamburger button; closes on backdrop click or route transition. *(NEEDS-BROWSER-TEST)*

### 3.2 Sidebar Group Ordering (All 6 Staff Roles)
- **Order:**
  1. `Overview` (Top item)
  2. `Profile Group` ("Me" for nurse, "Clinician Profile" for doctor, physio, speech therapist, psychotherapist, dietician)
  3. `Clinical Care Group` (Patient File, Appointments, Quick Requests, etc.)
  4. Remaining groups (Trainings, Policies, Communication, etc.)
- **Single Patient Destination:** Only `Patient File` is displayed. `Patient Chart` is removed from the visible sidebar. The routes `/patient-chart` and `/nurse-patient-detail` remain active as seamless aliases pointing to `PatientFile`.

---

## 4. Chunk Loading & Dynamic Import Error Boundary

### 4.1 ChunkErrorBoundary
- **Component:** `frontend/src/components/ChunkErrorBoundary.jsx`
- **Placement:** Wraps `<Suspense>` around all lazy-loaded route pages in `App.jsx`.
- **Auto-Reload:** On chunk load failure (e.g. after new deployment with updated hash bundles), reloads once automatically using a `sessionStorage` guard (`chunk_reload_attempted`).
- **User Fallback UI:** If error persists after reload, displays a friendly "A new version of the application is available" screen with a prominent "Reload Application" button. *(NEEDS-BROWSER-TEST)*

---

## 5. Unified Patient File Hub & Monitoring Entries

### 5.1 Role-Based Tile Order & Default Active Tile
- Navigate to **Patient File** (`/patient-file`) and verify the tile arrangement:
  - **Nurse:** *Nurses' notes* (first/active) → *Vitals & Intake / Output* → *Medication chart* → *Doctor's notes* → *Consent forms* → *Lab reports* → *History sheets* → *Manager's checklist* → *Safety checklist* → *Rehabilitation notes*.
  - **Doctor:** *Consultations / Doctor's notes* (first/active) → *Nurses' notes* → *Vitals & Intake / Output* → *Medication chart* → *Lab reports* → *Consent forms* → *History sheets* → *Rehabilitation notes* → *Manager's checklist* → *Safety checklist*.
  - **Therapists (Physio, Speech, Psychotherapy, Dietetics):** *Rehabilitation notes* (first/active) → *Nurses' notes* → *Vitals & Intake / Output* → *Medication chart* → *Doctor's notes*...

### 5.2 Merged "Vitals & Intake / Output" Monitoring Tile & Form B
1. Select the **Vitals & Intake / Output** tile (`monitoring`).
2. Verify both Vital Signs observations (BP, HR, Temp, SpO2, Blood Glucose) and Fluid Balance (Intake ml, Output ml, Net balance) render in the unified timeline.
3. Click **+ Add Entry** to open bedside Form B modal (`VitalsRecordFormB.jsx`).
4. **Simultaneous Submission:** Allows entering both vital signs and fluid intake/output in a single form submission.
5. **Server Timestamp Default:** Defaults observation timestamp to current server time if left blank.
6. **Future-Date Rejection:** Backend serializer validates that future-dated observations cannot be recorded (HTTP 400).
7. **Double Submit Protection:** Submit button disables immediately and enters saving state to prevent duplicate records. *(NEEDS-BROWSER-TEST)*

---

## 6. Security & Permission Boundaries

| Role | Patient Records Access | Allowed Actions | Restricted Actions |
|---|---|---|---|
| **Nurse** | Assigned Patients Only | Record vitals, fluid balance, bedside nursing notes, execute MAR | Create prescriptions, formal doctor consultations |
| **Doctor** | Assigned Patients Only | Clinical consultation notes, prescriptions, lab orders, consents | Unassigned patient file access |
| **Therapists** | Assigned Patients Only | Therapy/rehab notes, progress assessments | General medication prescribing |
| **Super Admin** | All Patients | View & audit all records, manage staff/roster | None |
| **Accountant / CRM** | No EMR Access | Billing, invoicing, lead tracking | Direct clinical patient records (HTTP 403 Forbidden on `/api/patients/vitals/`, `/records/`, etc.) |

