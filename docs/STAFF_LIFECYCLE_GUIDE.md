# Staff Lifecycle Architecture & Operational Guide

**System:** eHealth Hospital at Home (HomeCare OS)  
**Module:** Staff Onboarding, Requirement Checklists, Document Verification & Lifecycle Stages  
**Stages:** Trainee &rarr; Probation &rarr; Active Employee  
**Last Updated:** November 2026  
**Status:** Implemented & Verified  

---

## 1. Executive Summary & Core Philosophy

The HomeCare OS Staff Lifecycle system enforces a data-driven, gatekeeper workflow ensuring that all healthcare professionals (nurses, doctors, physiotherapists, speech therapists, psychotherapists, dieticians, and administrative staff) meet stringent regulatory, legal, identity, and clinical competence milestones before they are permitted to attend to homecare patients or record medical data.

```
       [ Add Staff User ]
               │
               ▼
       ┌───────────────┐
       │    TRAINEE    │  ◄── Account created; one-time activation slip issued
       └───────┬───────┘      • ZERO clinical write access (blocked on 11 endpoints)
               │              • Scoped patient list returns 0 patients
               │ Gate 1: 9 Verification Requirements (ID, Degree, Police, etc.)
               ▼
       ┌───────────────┐
       │   PROBATION   │  ◄── Approved by Admin / Super Admin (Default: 90 days)
       └───────┬───────┘      • Clinical write access granted under supervision
               │              • "PROBATION" ribbon displayed on digital ID card
               │ Gate 2: Assessments (Training, Exam, Competency) + Feedback
               ▼
       ┌───────────────┐
       │    ACTIVE     │  ◄── Full permanent employee
       └───────────────┘      • Unrestricted role-based operational permissions
```

### Key Principles
1. **Clinical Safety First (Zero-Trainee Clinical Access):** Trainees cannot author or modify any clinical records (vital signs, nurse bedside notes, doctor consults, therapy logs, MAR medication administration, lab sample collection, shift handover notes, or scheduled care items).
2. **Private Document Storage:** Medical certificates, blood test reports, police background checks, and CNIC copies are stored in an unserved `private_media/` filesystem, completely segregated from public media and inaccessible via Nginx static routes. Access requires authenticated and authorized role-based Django streaming.
3. **Auditability:** Every stage transition, stage return, document review, and requirement waiver is recorded in an append-only audit trail (`StaffStageEvent`).
4. **Data-Driven Checklists:** Requirements are not hard-coded; they reside in `StaffRequirementType` and can be customized per branch or organization.
5. **Anti-Enumeration Activation:** Account activation codes are hashed using PBKDF2 with constant-time verification, identical generic error messages, and IP/user rate-limiting to prevent brute force or username scraping.

---

## 2. The Three Lifecycle Stages

| Stage | Identifier | Clinical Write Access | Scoped Patient Access | Portal UI Experience | Digital ID Card |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trainee** | `trainee` | **BLOCKED (403)** | **EMPTY (0)** | Overview + My Onboarding only | **TRAINEE** badge |
| **Probation** | `probation` | Allowed (`probation`) | Standard Scoped | Full Role Portal | **PROBATION** ribbon |
| **Active** | `active` | Allowed (`active`) | Standard Scoped | Full Role Portal | Standard Valid Card |

> [!NOTE]
> **Legacy Employees & Backward Compatibility:** Existing staff members created prior to the lifecycle rollout default to `active` stage (`is_legacy_unreviewed=True`), ensuring existing clinical operations remain uninterrupted. Admins can audit or verify legacy staff retroactively without breaking workflows.

---

## 3. End-to-End Operational Workflow

### Step 1: Staff Creation & Activation Slip Issuance
1. **HR / Admin Action:** Admin navigates to `/staff` and clicks **"Add Staff Member"**.
2. **Form Entry:** Enters full legal name, role, email, phone, CNIC, and designation.
3. **Backend Execution:**
   - Creates `User` with `is_active=False`.
   - Creates `StaffMember` with `lifecycle_stage='trainee'`, `trainee_started_at=now()`.
   - Seeds checklist: Instantiates a `StaffRequirement` row for every active `StaffRequirementType`.
   - Generates a cryptographically random, 8-character alphanumeric activation code (`StaffActivationCode`).
   - Hashes code using PBKDF2 (`code_hash`), sets expiration date (`STAFF_ACTIVATION_CODE_DAYS = 7`).
4. **Printable Slip Generation:** The UI presents a modal containing the **Staff Account Activation Slip**:
   - Contains: Staff Name, Username, One-Time Activation Code, Expiration Timestamp, and Activation URL (`/activate`).
   - Admin can print or save the slip to hand over to the new hire during physical induction.

### Step 2: First-Time Account Activation by Trainee
1. **Trainee Action:** Navigates to `/activate` on any desktop or mobile browser.
2. **Submission:** Enters their username, 8-character activation code, and chooses a strong new password.
3. **Security Protections:**
   - **Timing Attack Mitigation:** If the username or code is invalid, a dummy PBKDF2 hash computation is executed so response time is indistinguishable from a valid attempt.
   - **Generic Masking:** Returns identical `'Invalid username or activation code.'` regardless of whether the user does not exist, code was mistyped, code expired, or code was already used.
   - **Rate Limiting:** 5 failed attempts locks out the user/IP for 15 minutes (`429 Too Many Requests`).
4. **Success:** User is marked `is_active=True`, activation code is marked `used_at=now()`, password is set, and trainee is redirected to login.

### Step 3: Trainee Portal & Document Submission
1. **Restricted Navigation:** Trainee logs in. The sidebar hides clinical navigation (Patients, Consultations, Roster, Prescriptions) and exposes:
   - **Overview:** Trainee ID card and greeting.
   - **My Onboarding:** `/staff/onboarding` self-service page.
2. **Checklist Overview:** The trainee views the 9 Gate 1 requirements:
   - ID Card / B-Form (1 required)
   - Qualifications (1 required)
   - Diploma / Degree (1 required)
   - Passport-size Photograph (1 required)
   - Guardian ID (2 required &ndash; father/mother/guardian CNIC)
   - Police Verification Certificate (1 required)
   - Blood Tests (1 required &ndash; HBV, HCV, CBC)
   - Contract of Employment (1 required)
   - Experience Letter (1 required &ndash; can be waived for fresh graduates)
3. **Upload Process:** Trainee uploads files (PDF, PNG, JPG, max 10MB per file). Each upload creates a `StaffDocument` linked to the requirement. Document status starts as `pending`.

### Step 4: Admin Review, Verification & Waiver
1. **HR / Admin Review:** Admin opens the **Staff Onboarding Drawer** on `/staff`.
2. **Reviewing Documents:**
   - Admin clicks **Download** to review submitted certificates in a secure browser tab via authenticated streaming.
   - Admin clicks **Approve** &rarr; marks document `verified` with timestamp and reviewer ID.
   - Admin clicks **Reject** &rarr; supplies written rejection reason (e.g. "Blurry photo", "Expired certificate"); requirement returns to `pending` and trainee is prompted to re-upload.
3. **Experience Letter Waiver (Super Admin Only):**
   - For fresh graduates or entry-level positions without prior work history, a `super_admin` can click **Waive**.
   - Requires entering a mandatory written justification (e.g. "Fresh nursing school graduate - no prior experience required").
   - Requirement status becomes `waived`. Standard `admin` cannot waive (receives `403 Forbidden`).

### Step 5: Advance to Probation (Gate 1 Passed)
1. **Verification Gate Check:** Once all 9 requirements are either `verified` (with required document count met) or `waived`, the **"Advance to Probation"** button unlocks.
2. **Advancement Action:** Admin clicks **"Advance to Probation"**.
3. **System Transition:**
   - `StaffMember.lifecycle_stage` &rarr; `'probation'`
   - `StaffMember.probation_started_at` &rarr; `now()`
   - `StaffMember.probation_end_date` &rarr; `now() + 90 days` (`STAFF_PROBATION_DEFAULT_DAYS`)
   - Logs `StaffStageEvent` (`from_stage='trainee'`, `to_stage='probation'`).
4. **Clinical Privileges Unlocked:** The staff member now has permission to author clinical notes under supervision; digital ID card displays `PROBATION` ribbon.

### Step 6: Probation Assessments & Feedback (Gate 2)
During the 90-day probation period, 5 requirements must be completed:
1. **Assessments (Completed by Clinical Supervisors / Admin):**
   - **Training Completion:** Passing grade and evaluation notes recorded.
   - **Exam Clearance:** Clinical protocol exam score recorded.
   - **Competency Check:** (Label constant: *"Competency check"*; based on handwritten confidence/competency evaluation protocol).
2. **Feedback Collection:**
   - **Management Feedback:** At least `STAFF_MIN_MANAGEMENT_FEEDBACK = 1` submitted by Care Manager or Admin.
   - **Patient Family Feedback:** At least `STAFF_MIN_FAMILY_FEEDBACK = 1` recorded from homecare patient family interviews by Care Manager or Admin.

### Step 7: Advance to Active Employee (Gate 2 Passed)
1. **Final Gate Check:** System verifies all 3 assessments are passed and minimum required feedbacks exist.
2. **Advancement Action:** Admin clicks **"Confirm Active Employee"**.
3. **System Transition:**
   - `StaffMember.lifecycle_stage` &rarr; `'active'`
   - `StaffMember.active_since` &rarr; `now()`
   - Logs `StaffStageEvent` (`from_stage='probation'`, `to_stage='active'`).
4. Staff member is now a fully verified, permanent member of the clinical staff.

### Reversion / Return to Previous Stage
If a probationer requires retraining or fails an assessment, an Admin or Super Admin can return them to Trainee:
- Click **"Return to Trainee"** in the Onboarding Drawer.
- Mandatory `reason` field must be supplied (e.g. "Failed clinical protocol exam; enrolled in 2-week remedial training").
- Stage shifts back, clinical write privileges are revoked, and an audit `StaffStageEvent` is committed.

---

## 4. Permission & Access Control Matrix

The system implements strict Role-Based Access Control (RBAC):

| Action / Capability | `super_admin` | `admin` | `branch_manager` | `care_manager` | `self` (Staff Member) | Other Staff |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Onboarding Status & Stepper** | Yes | Yes | Status Only (No URLs) | No | Own Checklist Only | 403 |
| **Download / View Uploaded Files** | Yes | Yes | **403 Forbidden** | **403 Forbidden** | Own Files Only | 403 |
| **Upload Requirement Documents** | Yes | Yes | 403 | 403 | Own Files Only | 403 |
| **Verify / Reject Documents** | Yes | Yes | 403 | 403 | 403 | 403 |
| **Waive Requirements** | **Yes** | **403 Forbidden** | 403 | 403 | 403 | 403 |
| **Record Clinical Assessments** | Yes | Yes | 403 | 403 | 403 | 403 |
| **Submit Management Feedback** | Yes | Yes | 403 | **Yes** | 403 | 403 |
| **Submit Patient Family Feedback**| Yes | Yes | 403 | **Yes** | 403 | 403 |
| **Advance / Return Lifecycle Stage** | Yes | Yes | 403 | 403 | 403 | 403 |
| **Regenerate Activation Code Slip** | Yes | Yes | 403 | 403 | 403 | 403 |

---

## 5. Clinical Safety & Trainee Block Implementation

To guarantee clinical safety, 11 distinct clinical endpoints and operations enforce trainee blocking:

```python
# Central Enforcement Utility (backend/homecareOS/clinician_permissions.py)
def check_clinical_write_permission(user, patient, record_date=None):
    # 1. Superuser / Admin bypass
    if user.is_superuser or user.role in ('admin', 'super_admin'):
        return True, ""
    
    # 2. STRICT LIFECYCLE STAGE GUARD
    staff_profile = getattr(user, 'staff_profile', None)
    if staff_profile and staff_profile.lifecycle_stage == 'trainee':
        return False, "Trainees are not permitted to author or modify clinical records."
    
    # 3. Clinical role & patient assignment checks...
```

### Guarded Operations:
1. **Vital Signs (`POST /api/patients/{id}/vitals/`):** Returns `403 Forbidden` if trainee attempts to submit blood pressure, pulse, SpO2, temperature, or blood glucose.
2. **Nurse Bedside Notes (`POST /api/patients/{id}/nurse_notes/`):** Returns `403 Forbidden`.
3. **Doctor Consult Notes (`POST /api/patients/{id}/doctor_notes/`):** Returns `403 Forbidden`.
4. **Therapy Session Logs (`POST /api/patients/{id}/therapy_notes/`):** Returns `403 Forbidden`.
5. **MAR Medication Administration (`POST /api/patients/{id}/mar_administer/`):** Returns `403 Forbidden`.
6. **Scheduled Item Status Updates (`PATCH /api/patients/{id}/scheduled-items/{item_id}/`):** Returns `403 Forbidden`.
7. **Clinical Record Error Marking (`POST /api/patients/record-integrity/mark-error/`):** Blocked in `record_integrity.py`.
8. **Lab Sample Collection (`POST /api/lab/orders/{id}/collect-sample/`):** Blocked in `lab/views.py`.
9. **Shift Handover Notes (`POST /api/staff-portal/handover-notes/`):** Blocked in `staff_portal/views.py`.
10. **Assigned Patient Scoping (`get_assigned_patient_ids_for_clinician`):** Returns `set()` (empty set) so trainees cannot query or list patient files.
11. **Patient List View (`GET /api/patients/`):** Returns `qs.none()` for trainee accounts.

---

## 6. Document Storage & Security Architecture

### Directory Isolation
- **Public Media (User avatars, public marketing images):** Stored in `backend/media/` and served via Nginx or standard static storage.
- **Private Media (Staff onboarding documents, CNICs, medical tests):** Stored in `backend/private_media/`.
  - Added to `.gitignore` to prevent committing sensitive files to version control.
  - Excluded from all Nginx location blocks (Nginx never serves `/private_media/`).
  - Persisted in Docker deployments using a dedicated named volume: `private_media_files:/app/private_media`.

### Streaming Download Endpoint
Documents are accessed strictly through `GET /api/staff/{id}/lifecycle/documents/{doc_id}/download/`:
1. Authenticates requesting user token.
2. Checks role authorization (Super Admin, Admin, or the Staff Member themselves).
3. Validates file path using Django `FileResponse`.
4. Sets `Content-Disposition: inline; filename="..."` with appropriate MIME types for direct browser viewing.

---

## 7. Data Models & Database Schema

All models reside in `backend/staff/models.py`:

```
StaffMember
├── lifecycle_stage: ('trainee', 'probation', 'active')
├── trainee_started_at: datetime
├── probation_started_at: datetime
├── probation_end_date: date
├── active_since: datetime
└── is_legacy_unreviewed: boolean

StaffRequirementType (Data-driven checklist definitions)
├── code: 'id_card', 'degree', 'police_verification', 'training_completion', etc.
├── label: 'ID card or B-Form', 'Diploma / Degree', etc.
├── kind: ('document', 'assessment', 'feedback')
├── gate: ('trainee_to_probation', 'probation_to_active')
├── required_count: integer (e.g. 2 for Guardian ID, 1 for others)
└── allows_waiver: boolean (True only for experience_letter)

StaffRequirement (Per-staff checklist instance)
├── staff_member: FK(StaffMember)
├── requirement_type: FK(StaffRequirementType)
├── status: ('pending', 'submitted', 'verified', 'rejected', 'waived')
├── waived_at, waived_by: User
└── waiver_reason: text

StaffDocument (Secure document attachments)
├── requirement: FK(StaffRequirement)
├── file: FileField(storage=private_storage, upload_to='staff_docs/%Y/%m/')
├── original_filename: string
├── file_size: integer
├── uploaded_by: FK(User)
├── status: ('pending', 'verified', 'rejected')
├── verified_at, verified_by: User
└── rejection_reason: text

StaffAssessment (Probation exam, training, and competency evaluations)
├── staff_member: FK(StaffMember)
├── assessment_type: ('training_completion', 'exam_clearance', 'competency_check')
├── score / grade: string
├── passed: boolean
├── evaluated_by: FK(User)
└── notes: text

StaffFeedback (Management and family evaluations)
├── staff_member: FK(StaffMember)
├── feedback_type: ('management', 'family')
├── reviewer_name: string
├── rating: integer (1 to 5)
├── comments: text
└── recorded_by: FK(User)

StaffStageEvent (Immutable, append-only lifecycle audit trail)
├── staff_member: FK(StaffMember)
├── from_stage: string
├── to_stage: string
├── transitioned_by: FK(User)
├── reason: text
└── created_at: datetime

StaffActivationCode (One-time credential onboarding token)
├── staff_member: FK(StaffMember)
├── code_hash: PBKDF2 hash string
├── expires_at: datetime (7 days)
└── used_at: datetime
```

---

## 8. REST API Reference

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/staff/{id}/lifecycle/` | Admin, Super Admin, Branch Mgr (status only), Self | Returns stage, checklist items, completion counts, and review deadlines. |
| `POST` | `/api/staff/{id}/lifecycle/documents/` | Admin, Super Admin, Self | Uploads document file for a specific requirement ID. |
| `GET` | `/api/staff/{id}/lifecycle/documents/{doc_id}/download/` | Admin, Super Admin, Self | Streams private document with RBAC authentication. |
| `POST` | `/api/staff/{id}/lifecycle/documents/{doc_id}/verify/` | Admin, Super Admin | Approves submitted document. |
| `POST` | `/api/staff/{id}/lifecycle/documents/{doc_id}/reject/` | Admin, Super Admin | Rejects document with mandatory `rejection_reason`. |
| `POST` | `/api/staff/{id}/lifecycle/requirements/{req_id}/waive/` | **Super Admin Only** | Waives requirement with mandatory `waiver_reason`. |
| `POST` | `/api/staff/{id}/lifecycle/assessments/` | Admin, Super Admin | Records score and pass/fail for probation assessments. |
| `POST` | `/api/staff/{id}/lifecycle/feedback/` | Admin, Super Admin, Care Manager | Submits management or patient-family feedback. |
| `POST` | `/api/staff/{id}/lifecycle/advance/` | Admin, Super Admin | Validates gate requirements and advances stage (`trainee` &rarr; `probation` or `probation` &rarr; `active`). |
| `POST` | `/api/staff/{id}/lifecycle/return/` | Admin, Super Admin | Returns staff to prior stage with mandatory `reason`. |
| `POST` | `/api/staff/{id}/lifecycle/regenerate-code/` | Admin, Super Admin | Generates fresh one-time activation slip if previous code expired. |
| `POST` | `/api/auth/staff-activate/` | **Public (Rate Limited)** | Activates new staff account with code, sets initial password. |

---

## 9. Frontend User Interface Components

| Component File | Location | Primary Purpose |
| :--- | :--- | :--- |
| `StaffOnboardingDrawer.jsx` | `frontend/src/components/` | Slide-over drawer for Admins: displays multi-stage stepper, requirement checklist, document verification, waiver input, assessment recording, feedback input, and stage advance/return buttons. |
| `AddStaffUserModal.jsx` | `frontend/src/components/` | Add staff modal with printable Credential Slip output upon creation. |
| `MyOnboarding.jsx` | `frontend/src/pages/` | Trainee portal view (`/staff/onboarding`): allows trainees to monitor checklist status and upload required files. |
| `ActivateStaff.jsx` | `frontend/src/pages/` | Clean public onboarding portal (`/activate`) for setting initial account password via activation code. |
| `Staff.jsx` | `frontend/src/pages/` | Staff directory table: displays colored stage badges (`Trainee`, `Probation`, `Active`), document upload progress counters (`4/9`), and review due warnings. |
| `StaffIdCard.jsx` | `frontend/src/components/` | Visual credential card: overlays high-visibility `TRAINEE` and `PROBATION` ribbons. |
| `staffLifecycleHelpers.js` | `frontend/src/utils/` | Formatting utilities, badge color mappings, gate calculation helpers, and validation logic. |

---

## 10. Production & VPS Deployment Runbook

When deploying updates to the live Linux / Docker VPS environment, execute the following steps:

### 1. Apply Migrations
Apply the schema and seed data migrations:
```bash
docker compose exec web python manage.py migrate staff
```
*Applies `0010_staffrequirementtype_staffmember_active_since_and_more.py` and `0011_seed_staff_requirement_types.py`.*

### 2. Verify Docker Compose Storage Volumes
Ensure `docker-compose.yml` mounts the dedicated `private_media_files` volume so uploaded documents persist across container restarts and updates:
```yaml
services:
  web:
    volumes:
      - media_files:/app/media
      - private_media_files:/app/private_media

volumes:
  media_files:
  private_media_files:
```

### 3. Verify Nginx Configuration
Verify that the Nginx configuration does **NOT** expose `/private_media/`:
- `location /media/ { alias /app/media/; }` &larr; Public files (allowed).
- Confirm there is **no** `location /private_media/` directive. Private files must only flow through the authenticated `/api/staff/{id}/lifecycle/documents/{doc_id}/download/` endpoint.

### 4. Run Diagnostic Health Check
Verify existing staff members and requirement types via Django shell:
```bash
docker compose exec web python manage.py shell -c "
from staff.models import StaffRequirementType, StaffMember
print('Requirement Types Count:', StaffRequirementType.objects.count())
print('Active Staff:', StaffMember.objects.filter(lifecycle_stage='active').count())
print('Trainees:', StaffMember.objects.filter(lifecycle_stage='trainee').count())
"
```
*Expected: 14 requirement types (9 trainee gate + 5 probation gate).*

