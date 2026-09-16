# HomeCare OS (Hospital at Home) — Comprehensive System & API Documentation

> **Version:** 2.0.0 Enterprise  
> **Backend:** Django 4.2+ / Django REST Framework (DRF) / simplejwt / drf-spectacular  
> **Frontend:** React 18 / Vite / Zustand State Engine / Lucide Icons / Recharts / OpenStreetMap  
> **Database:** SQLite (Development) / PostgreSQL (Production-ready)  
> **Target Audience:** System Architects, Full-Stack Developers, DevOps Engineers, Healthcare Operations & Clinical Administrators  

---
## Table of Contents

1. [System Architecture & Overview](#1-system-architecture--overview)
2. [Security, Authentication & Role-Based Access Control (RBAC)](#2-security-authentication--role-based-access-control-rbac)
   - [Supported User Roles](#supported-user-roles)
   - [Authentication Protocol (JWT) & Dual Identifier Login](#authentication-protocol-jwt--dual-identifier-login)
   - [Admin-Set Staff Provisioning & Credentialing](#admin-set-staff-provisioning--credentialing)
   - [Permission Matrix](#permission-matrix)
3. [Frontend Page Catalog & Detailed Feature Specifications (19 Pages)](#3-frontend-page-catalog--detailed-feature-specifications-19-pages)
   - [Page 1: Public Website & 6-Step Booking Wizard](#page-1-public-website--6-step-booking-wizard)
   - [Page 2: Public Identity & Certificate Verification Portal](#page-2-public-identity--certificate-verification-portal)
   - [Page 3: Authentication & Password Reset Portal](#page-3-authentication--password-reset-portal)
   - [Page 4: Family Portal (Hospital at Home for Families)](#page-4-family-portal-hospital-at-home-for-families)
   - [Page 5: Operations Overview Dashboard](#page-5-operations-overview-dashboard)
   - [Page 6: Bookings & Scheduling Management](#page-6-bookings--scheduling-management)
   - [Page 7: Live GPS Field Tracking, Geofencing & SOS Dispatch](#page-7-live-gps-field-tracking-geofencing--sos-dispatch)
   - [Page 8: Staff & Clinical Workforce Roster (with Staff Profile Dossier)](#page-8-staff--clinical-workforce-roster-with-staff-profile-dossier)
   - [Page 9: Patient Directory (EMR)](#page-9-patient-directory-emr)
   - [Page 10: Patient 360° Comprehensive Dossier (Forms A, B, C)](#page-10-patient-360-comprehensive-dossier-forms-a-b-c)
   - [Page 11: Specialized Therapy Services](#page-11-specialized-therapy-services)
   - [Page 12: Admin & Human Resources](#page-12-admin--human-resources)
   - [Page 13: Financial Accounts](#page-13-financial-accounts)
   - [Page 14: Billing & Invoicing](#page-14-billing--invoicing)
   - [Page 15: CRM & Leads Pipeline](#page-15-crm--leads-pipeline)
   - [Page 16: Operational Reports](#page-16-operational-reports)
   - [Page 17: Reports & Analytics](#page-17-reports--analytics)
   - [Page 18: Settings & User Management](#page-18-settings--user-management)
   - [Page 19: Clinical LMS (Learning Management System) & Certification Studio](#page-19-clinical-lms-learning-management-system--certification-studio)
4. [Backend API Reference (Every Endpoint & URL)](#4-backend-api-reference-every-endpoint--url)
   - [Core & Documentation URLs](#core--documentation-urls)
   - [Authentication Endpoints (`/api/auth/`)](#authentication-endpoints-apiauth)
   - [Bookings API (`/api/bookings/`)](#bookings-api-apibookings)
   - [Staff & HR API (`/api/staff/`)](#staff--hr-api-apistaff)
   - [Patients & EMR API (`/api/patients/`)](#patients--emr-api-apipatients)
   - [Tracking, Geofencing & Route API (`/api/tracking/`)](#tracking-geofencing--route-api-apitracking)
   - [Accounts & Financial Reports API (`/api/accounts/`)](#accounts--financial-reports-api-apiaccounts)
   - [Billing & Invoicing API (`/api/billing/`)](#billing--invoicing-api-apibilling)
   - [CRM & Lead Lifecycle API (`/api/crm/`)](#crm--lead-lifecycle-api-apicrm)
   - [Clinical LMS & Continuing Education API (`/api/lms/`)](#clinical-lms--continuing-education-api-apilms)
   - [Public Real-Time Certificate Verification (`/api/certificates/verify/`)](#public-real-time-certificate-verification-apicertificatesverify)
   - [Patient/Family Portal API (`/api/portal/`)](#patientfamily-portal-api-apiportal)
   - [Notifications API (`/api/notifications/`)](#notifications-api-apinotifications)
5. [Universal PDF Generation & Printing Subsystem](#5-universal-pdf-generation--printing-subsystem)
   - [High-Fidelity Official Accredited Certificate Generator](#high-fidelity-official-accredited-certificate-generator)
6. [Data Models & Entity-Relationship Schema](#6-data-models--entity-relationship-schema)
   - [Core Clinical Schema](#core-clinical-schema)
   - [LMS & Certification Schema](#lms--certification-schema)
7. [Deployment & Environment Configuration](#7-deployment--environment-configuration)
   - [Daphne ASGI Server for Real-Time WebSockets](#daphne-asgi-server-for-real-time-websockets)
   - [Dynamic Frontend API Base (`VITE_API_URL` & `.env.production`)](#dynamic-frontend-api-base-vite_api_url--envproduction)
8. [Mobile & Dashboard Cross-Platform Integration Architecture](#8-mobile--dashboard-cross-platform-integration-architecture)
9. [React Native Mobile App Architecture & Screen Catalog (`mobile/`)](#9-react-native-mobile-app-architecture--screen-catalog-mobile)
   - [Mobile Architecture & Directory Structure](#mobile-architecture--directory-structure)
   - [Clinician Mobile Workflow Screens (19 Screens)](#clinician-mobile-workflow-screens-19-screens)
   - [Family Portal Mobile Screens (6 Screens)](#family-portal-mobile-screens-6-screens)
   - [Mobile Offline Queue & Real-Time Services](#mobile-offline-queue--real-time-services)
10. [Real Backend Persistence & Data Integrity Architecture](#10-real-backend-persistence--data-integrity-architecture)
    - [Zero-Mock Real Persistence Enforcement](#zero-mock-real-persistence-enforcement)
    - [Admin-Set Staff Provisioning & Immediate Login](#admin-set-staff-provisioning--immediate-login)
    - [Real-Time Scheduling & Dispatch Persistence](#real-time-scheduling--dispatch-persistence)

---

## 1. System Architecture & Overview

HomeCare OS is an enterprise healthcare management system specifically designed for **Hospital at Home**, **Skilled Home Nursing**, **Palliative Care**, and **Home Rehabilitation Services**.

```
                           +----------------------------+
                           |     Public Web Visitors    |
                           +--------------+-------------+
                                          |
                                          v
+-----------------------+     +-----------+------------+     +------------------------+
| Patient Family Portal | <-> | React 18 Single Page   | <-> | Admin / Clinical Staff |
| (Restricted View)     |     | Application (Vite)     |     | Dashboard (19 Pages)   |
+-----------------------+     +-----------+------------+     +------------------------+
                                          |
                                          | REST API / Daphne ASGI WebSockets (Bearer JWT)
                                          v
                              +-----------+------------+
                              | Django 4.2 REST + ASGI |
                              | Backend (homecareOS)   |
                              +-----+-----+------+-----+
                                    |     |      |
         +--------------------------+     |      +------------------------+
         v                                v                               v
+------------------+             +-----------------+             +------------------+
| SQLite/Postgres  |             | drf-spectacular |             | ReportLab Vector |
| Relational DB    |             | OpenAPI 3.0 Doc |             | Cert & Doc Engine|
+------------------+             +-----------------+             +------------------+
```

### Architectural Key Characteristics
- **Client Tier (`frontend/`):** React 18 SPA built with Vite. Central state managed by `zustand` (`frontend/src/store/useStore.js`) connected to real backend endpoints (`import.meta.env.VITE_API_URL`) with persistent caching, optimistic UI updates, and reactive synchronization.
- **Mobile Tier (`mobile/`):** React Native / Expo cross-platform mobile app for field clinicians and patient families, utilizing Axios interceptors, background geolocation tasks, offline mutation queues, and native WebSockets.
- **Server Tier (`backend/`):** Django 4.2 framework utilizing Django REST Framework (DRF) and Daphne ASGI for asynchronous WebSocket broadcasting. Modular app structure separating business domains: `accounts`, `billing`, `bookings`, `crm`, `lms`, `notifications`, `patients`, `portal`, `reports`, `staff`, `tracking`.
- **Security:** Token-based authentication using `rest_framework_simplejwt` with dual username/email login support, admin-set password provisioning, short-lived access tokens, and refresh rotation.
- **Documentation Engine:** `drf-spectacular` generating automated OpenAPI 3.0 schemas with an interactive Swagger UI.

---

## 2. Security, Authentication & Role-Based Access Control (RBAC)

HomeCare OS enforces strict role-based access control across navigation, page rendering, API endpoints, and field-level data visibility.

### Supported User Roles

| Role Key | Display Name | Primary Responsibilities | Default Landing Page |
| :--- | :--- | :--- | :--- |
| `super_admin` | Super Admin | Full unrestricted control across all branches, permissions editing, audit trails, user lifecycle, staff roster, and financial/billing administration. | Overview (`overview`) |
| `admin` | Admin | Branch operations management, patient admissions, scheduling, CRM leads, and operational workflows. Restricted from billing, staff management, and system settings. | Overview (`overview`) |
| `branch_manager` | Branch Manager | Local branch operations, bookings, staff attendance, and live dispatch tracking. | Overview (`overview`) |
| `care_manager` | Care Manager | Patient clinical oversight, nurse visit assignments, care plans, and family coordination. | Overview (`overview`) |
| `nurse` | Nurse / Doctor | Bedside clinical care, Form A (Nurses Notes), Form B (Vitals), Form C (MAR), daily reports, LMS courses. | Bookings (`bookings`) |
| `accountant` | Accountant | Invoicing, payments collection, balance reconciliation, and revenue analytics. | Overview (`overview`) |
| `crm_executive` | CRM Executive | Lead acquisition, inbound phone/web inquiries, and booking conversion pipeline. | CRM (`crm`) |
| `patient_family` | Patient / Family | Read-only access to care progress, visit schedules, invoices, vitals, and care manager chat. | Family Portal (`family-portal`) |

### Authentication Protocol (JWT) & Dual Identifier Login

- **Access Token Endpoint:** `POST /api/auth/login/`
  - **Dual Identifier Input:** Supports authentication using either the registered `username` or primary `email`:
    ```json
    {
      "username": "nurse1@homecareos.com",  // Or "nurse1"
      "password": "your_secure_password"
    }
    ```
  - **Output (200 OK):**
    ```json
    {
      "access": "<JWT_ACCESS_TOKEN>",
      "refresh": "<JWT_REFRESH_TOKEN>",
      "user": {
        "id": 5,
        "username": "nurse1",
        "email": "nurse1@homecareos.com",
        "role": "nurse",
        "full_name": "Nurse Fatima Zahra",
        "staff_id": 2
      }
    }
    ```
- **Refresh Token Endpoint:** `POST /api/auth/refresh/`
  - Input: `{"refresh": "<JWT_REFRESH_TOKEN>"}`
  - Output: `{"access": "<NEW_JWT_ACCESS_TOKEN>"}`
- **Client Storage:** Tokens stored securely in app memory with optional persistent storage when *Remember Me* is enabled.

### Admin-Set Staff Provisioning & Credentialing

Unlike consumer registration workflows, healthcare staff accounts are administratively provisioned:
1. When a Super Administrator registers a new staff member via the Web Dashboard (`Staff.jsx` or `UserManagement.jsx`), they specify the clinician's `name`, `role`, `email`, `username`, and an initial **admin-set password**.
2. The backend `StaffSerializer` atomically creates both the `Staff` record and a linked Django `User` model, setting the hashed password directly via `user.set_password(password)`.
3. The clinician can immediately log in to the React Native mobile app (`LoginScreen.js`) or web dashboard using their assigned credentials without requiring external email verification links.

### Permission Matrix

| Module | Super Admin | Admin | Branch Manager | Care Manager | Nurse | Accountant | CRM Exec | Patient Family |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Bookings** | `V A E D` | `V A E` | `V A E` | `V A E` | `V` | `V` | `V A` | `V` |
| **Patients (EMR)** | `V A E D` | `V A E` | `V A E` | `V A E` | `V` | `V` | - | `V` |
| **Billing & Invoices** | `V A E D` | - | `V` | - | - | `V A E` | - | `V` |
| **Financial Accounts** | `V A E D` | - | - | - | - | `V A E` | - | - |
| **Staff Roster** | `V A E D` | - | `V A E` | `V` | - | - | - | - |
| **User Management & Settings** | `V A E D` | - | - | - | - | - | - | - |

*(Legend: **V** = View, **A** = Add/Create, **E** = Edit/Update, **D** = Delete/Purge)*

---

## 3. Frontend Page Catalog & Detailed Feature Specifications

The frontend router (`frontend/src/App.jsx`) dynamically resolves pages according to `activePage` state and validates user authorization through `ROLE_CONFIG`.

```
===================================================================================================
                                HOMECARE OS FRONTEND SITEMAP
===================================================================================================
├── Public Pages
│   ├── [1] Public Website (`public-website`) [Tabs: Home, Services, Pricing, Blog, About, Contact]
│   └── [2] Public Identity Verification (`public-verification`) [Query: ?empId=EMP-2024-XXX]
├── Authentication
│   └── [3] Secure Sign In & Password Recovery (`login`)
├── Patient & Family
│   └── [4] Family Portal (`family-portal`) [7 Sections]
└── Enterprise Admin & Clinical Workspace
    ├── [5] Overview Dashboard (`overview`)
    ├── [6] Bookings & Scheduling (`bookings`)
    ├── [7] Live GPS Tracking (`live-tracking`) [Views: Map, List, SOS, Geofence]
    ├── [8] Staff & Workforce (`staff`) [Tabs: Directory, Daily Log, Calendar, Leave, Payroll]
    ├── [9] Patients Directory (`patients`)
    ├── [10] Patient 360° Dossier (`patient-360`) [10 Sub-tabs, Forms A, B, C]
    ├── [11] Therapy Services (`therapy`) [Physio, Speech, Psychotherapy, Dietician]
    ├── [12] Admin / HR Hub (`admin-hr`) [Announcements, SOP Docs, Training, Salaries, CMS]
    ├── [13] Financial Accounts (`accounts`)
    ├── [14] Billing & Invoicing (`billing`)
    ├── [15] CRM Leads Pipeline (`crm`) [Interactive Drag & Drop Kanban]
    ├── [16] Operational Reports (`reports`)
    ├── [17] Executive Analytics (`analytics`)
    ├── [18] User Management & Security (`users`) [Accounts, Permissions Matrix, Audit Trail]
    └── [19] Clinical LMS & Certifications (`lms`) [Courses, Video Player, Cert Studio & QR]
===================================================================================================
```

---

### Page 1: Public Website & 6-Step Booking Wizard
- **Component:** `frontend/src/pages/PublicWebsite.jsx`
- **Internal Route ID:** `public-website`
- **Access Level:** Public / Unauthenticated
- **Sub-Tabs / Views:**
  1. `home`: Hero section with emergency helpline callout, service grid showcase, clinical workflow, patient testimonials, and doctor credentials.
  2. `services`: Detailed directory of 8 clinical offerings with transparent pricing and feature checklists.
  3. `pricing`: Package comparison for Long-term packages vs Per-visit rates.
  4. `blog`: Clinical SOPs, patient recovery guides, and medical advice written by registered clinicians.
  5. `about`: Accreditation credentials, PMDC/PNC licensing disclosures, and leadership overview.
  6. `contact`: Inbound message form that automatically creates a lead in the CRM pipeline.

#### 6-Step Public Booking Wizard Flow & Intake Field Specifications:
```
[ Step 1: Select Service ]
         |
         v
[ Step 2: Patient Demographics, Age/DOB, Emergency Contact & Written Address ]
         |
         v
[ Step 3: Clinical Condition, Allergies & Prescription / Doctor Consult ]
         |
         v
[ Step 4: Schedule, Shift Duration & Frequency ]
         |
         v
[ Step 5: Clinical Dossier Review & Payment Method ]
         |
         v
[ Step 6: Confirmation, Booking Reference (BK-2026-XXXX) & Family Portal Access ]
```

##### Standardized Booking Intake Field Catalog:
- **Required Fields (Enforced at Step Navigation & Submission):**
  1. `patient_name`: Full legal name of patient.
  2. `age` & `date_of_birth`: Bi-directionally synchronized. Changing age estimates year-of-birth; selecting birth date calculates exact chronological age.
  3. `phone`: Patient/family primary contact number (+92 formatted).
  4. `address`: Full written home address (House #, Street, Sector/Block, Locality, Islamabad).
  5. `latitude` & `longitude`: GPS coordinates pinned for navigation and geofencing.
  6. `emergency_contact_name` & `emergency_contact_phone`: Designated family representative for clinical emergencies.
  7. `diagnosis`: Primary illness, medical condition, or post-surgical status.
  8. `allergies`: Known adverse drug reactions (defaults to `No Known Drug Allergies (NKDA)`).
  9. `has_prescription` / `prescription_name` OR `consult_doctor_needed`:
     - **If Yes:** Clinical prescription or hospital discharge summary picture/PDF attached.
     - **If No:** System flags `consult_doctor_needed=True` for Medical Director tele-consultation before medication dispensation.
  10. `service_type`: Clinical package selected from catalog.
  11. `scheduled_time` (`start_date` & `start_time`): Requested initiation datetime.
  12. `shift_duration`: Length of bedside care (`1_hour`, `2_hours`, `4_hours`, `8_hours`, `12_hours`, `24_hours`).
  13. `shift_frequency`: Cadence of visits (`once`, `daily`, `alternate_days`, `weekly`).
  14. `payment_method`: Settlement method (`advance` online card payment vs `pay_on_service` cash/POS).
- **Optional Fields:**
  - `email`: Patient/family digital correspondence address.
  - `consultant_name` & `consultant_details`: Referring specialist physician and hospital.
  - `gender_preference`: Clinician gender requirement (`no_pref`, `female`, `male`).
  - `notes`: Specific home access codes, oxygen status, or bedside instructions.

- **Store Hook:** `submitPublicBooking(formData)` atomically:
  - Generates a new `MR-YYYY-XXX` medical record and registers the patient.
  - Creates a booking entry with reference code `BK-2026-XXXX` in `pending` status.
  - Registers a converted lead in the CRM pipeline for care coordination follow-up.

---

### Page 2: Public Identity & Certificate Verification Portal
- **Component:** `frontend/src/pages/PublicVerification.jsx`
- **Internal Route ID:** `public-verification` / `verify/:code`
- **Access Level:** Public / Unauthenticated (accessible via QR code printed on clinician physical ID cards, digital certificates, or SMS verification links)
- **Parameters:** `empId` (Staff Employee ID) OR `code` / `certId` (Certificate Unique Verification Code, e.g. `CERT-BLS-2026-001`)
- **Key Features:**
  - **Dual Public Validation Modes:**
    1. **Staff Identity & License Mode:**
       - **Live Verification Status Banner:** Queries the database in real-time. If the staff member's system user account is suspended or terminated, displays a high-visibility red warning: `"NOT CURRENTLY ACTIVE / ACCOUNT SUSPENDED — Do not admit to home"`.
       - If active, displays a verified green badge: `"OFFICIALLY VERIFIED & ACTIVE STAFF"`.
       - Displays clinician photo, full legal name, role designation, license certification (PMDC / PNC verified), and branch.
       - **Live Visit Status:** Indicates whether the nurse is currently dispatched to an active home visit.
    2. **Accredited Certificate Verification Mode (`/verify/:code`):**
       - Queries `GET /api/certificates/verify/<certificate_id>/`.
       - Displays tamper-proof accreditation badge: `"ACCREDITED & OFFICIALLY VERIFIED"` or `"REVOKED / EXPIRED"`.
       - Renders full certificate credential metadata: Course/Achievement Title, Recipient Clinician Name, Staff ID, Issue Date, Expiration Date, Issuing Authority (eHealth Hospital at Home / HomeCare OS), Accreditation Seals (IHRA / SECP), and Digital Signature verification hash.
       - One-click action to view or download the official ReportLab vector PDF certificate.
  - Direct 24/7 central dispatch helpline button (`+92-21-111-CARE-OS`).

---

### Page 3: Authentication & Password Reset Portal
- **Component:** `frontend/src/pages/Login.jsx`
- **Internal Route ID:** `login`
- **Access Level:** Public
- **Key Features:**
  - Split-screen branded UI with security disclosures.
  - Email or phone login with password masking toggle and "Remember Me" checkbox.
  - Account lockout and suspension detection: if a suspended user attempts login, displays an explicit suspension error message.
  - **Two-Step OTP Password Reset Modal:**
    - Step 1: User inputs registered email or phone.
    - Step 2: User inputs 6-digit OTP code and chooses a new password.
  - **Quick Demo Account Switcher:** One-click instant login buttons for rapid role testing (`super_admin`, `admin`, `care_manager`, `nurse`, `accountant`, `crm_executive`, `patient_family`).

---

### Page 4: Family Portal (Hospital at Home for Families)
- **Component:** `frontend/src/pages/FamilyPortal.jsx`
- **Internal Route ID:** `family-portal`
- **Access Level:** `patient_family`, `super_admin`
- **Key Features:**
  - Independent, dedicated sidebar navigation for family members.
  - **7 Functional Sub-tabs:**
    1. `dashboard`: Scheduled upcoming visits, primary attending nurse profile, and recent visit summaries.
    2. `visits`: Complete chronological log of historical home visits and attendance status.
    3. `notes`: Read-only view of Form A (Nurses Daily Clinical Progress Notes).
    4. `vitals`: Read-only view of Form B (Vitals trend chart and tabular history).
    5. `reports`: Formal clinical visit reports with downloadable summaries.
    6. `invoices`: Itemized billing invoices with payment status, breakdown, and PDF download.
    7. `messages`: Direct bidirectional communication with the patient's assigned Care Manager.

---

### Page 5: Operations Overview Dashboard
- **Component:** `frontend/src/pages/Overview.jsx`
- **Internal Route ID:** `overview`
- **Access Level:** All administrative and clinical roles (customizes dynamically per role)
- **Top-Level Executive Multi-Graph Suite:**
  - **Dynamic SVG Mini-Sparklines on Stat Cards:** Each KPI card integrates a micro-sparkline vector curve giving instant visual indication of directional acceleration, volatility, and pulse state alongside standard comparative indicators (e.g. `↑15% vs yesterday`, `↓3 vs yesterday`).
  - **Interactive Multi-Mode Command Center Chart:**
    - **Mode 1: Trajectory Trend:** Monotone bezier area curves with multi-stop linear gradients for revenue/visit volume, SLA target thresholds, and hover inspection tooltips.
    - **Mode 2: 24-Hour Clinician Dispatch Velocity & Demand Heatmap:** Composed bar and line chart illustrating completed, en-route, and upcoming visits across 2-hour shift windows, paired with a trendline of active on-road clinicians.
    - **Mode 3: Target Benchmark vs Actual:** Direct variance bar chart benchmarking completed visits against the +12% target threshold.
    - **Interactive Time Range Toggle:** Switches dynamically between `7 Days`, `28 Days`, and `90 Days`.
  - **Clinical Service Mix Distribution Donut Chart:**
    - Recharts donut visualization categorizing active patient care packages (Skilled Nursing, Physical Rehab & PT, Hospital at Home ICU, Elderly & Palliative, Medicine Logistics, Doctor Consults).
    - Features embedded center metric counter with total visits, slice padding, animated tooltips, and custom percentage allocation breakdown table.
  - **Clinical Operational Quality & SLA Radar:**
    - Multi-axial hexagonal radar diagram benchmarking 6 operational pillars: On-Time Arrival SLA (95.8%), Geofence Check-in Accuracy (98.4%), Vitals Compliance (94.2%), MAR Medication Adherence (99.1%), Patient Rating (97.5%), and Care Plan Goals (91.8%).
  - **Financial Role Privacy Isolation:** Revenue curves and financial figures are restricted to `super_admin` and `accountant`. Operational administrators (`admin`, `branch_manager`, `care_manager`) view pure clinical dispatch volumes.
- **Role Customization:**
  - **For Nurses:** Shows "My Visits Today", next scheduled stop countdown, personal review rating, field overtime hours, scheduled visit route table, and personal Digital Staff ID Card.
  - **For Care Managers:** Shows Active Visits, Unassigned Bookings queue, Critical Clinical Alerts, and real-time mini GPS tracking map.
  - **For Super Admins:** Full operational and financial command center (Active visits, bookings, revenue, operational alerts, multi-period financial trends, and geofence tracking).
  - **For Admins:** Operations-focused command center with volume trends, active visits, booking queues, and dispatch alerts (financial/billing data masked).
  - **For Accountants:** Invoices Due, Daily Collections, Outstanding Balances, and multi-period financial trend tracking.
  - **For CRM Executives:** Inbound Leads Pipeline metrics, conversion ratios, and new inquiry queues.

---

### Page 6: Bookings & Scheduling Management
- **Component:** `frontend/src/pages/Bookings.jsx`
- **Internal Route ID:** `bookings`
- **Access Level:** `super_admin`, `admin`, `branch_manager`, `care_manager`, `nurse`, `crm_executive`
- **Key Features:**
  - Comprehensive clinical data table displaying Booking Reference (`BK-2026-XXXX`), Patient Name, Service Type, Shift Duration (`4h`, `8h`, `12h`, `24h`), Status Badge, Primary Assigned Clinician, Backup Staff, Scheduled Time, Payment Method, and Payment Status.
  - Granular multi-status filters: `pending`, `assigned`, `en_route`, `in_progress`, `completed`, `cancelled`, `late`, `no_show`.
  - Service filters: `short_service`, `medicine_delivery`, `long_term`, `long_term_admission`.

#### Standardized Booking Creation Modal (Intake Protocol):
- Supports dual patient modes: **Existing Patient** (auto-populating demographics, MR number, emergency contact, and address) vs **New Patient Registration**.
- **Required Intake Fields:**
  1. Patient name
  2. Age and DOB (two-way synchronized)
  3. Contact number (+92 formatted)
  4. Written home address
  5. Current location (lat/lng coordinates & Leaflet map pin)
  6. Emergency contact (Name and Phone)
  7. Diagnosis or medical condition
  8. Prescription of medication or Hospital Discharge Summary:
     - Picture/PDF document upload if yes
     - Medical Director Tele-Consult assistance flag if no
  9. Allergies (clinical safety check, default `No Known Drug Allergies (NKDA)`)
  10. Required healthcare service
  11. Required Start date and time
  12. Shift duration (`1h`, `2h`, `4h`, `8h`, `12h`, `24h`) and frequency (`once`, `daily`, `alternate_days`, `weekly`)
  13. Payment method (`advance` online card payment vs `pay_on_service` cash/POS)
- **Optional Intake Fields:**
  - Email address
  - Consultant details (Referring doctor, hospital/phone)
  - Staff Gender preference (`no_pref`, `female`, `male`)
  - Additional clinical & access notes

#### 10-Point Mandatory Booking Assignment Protocol (`NurseAssignPanel.jsx`):
When a Care Manager or Administrator assigns or modifies field clinicians for a booking, the assignment modal strictly validates and persists all 10 clinical and operational fields:
1. **Booking Reference Number:** Formal institutional reference (`BK-2026-XXXX`).
2. **Patient Name & Written Address:** Complete with geocoded coordinates (Lat/Lng) and open map pin.
3. **Service & Shift Details:** Clinical package alongside specified shift duration (`8h Full Day`, `12h Extended`, `24h Bedside Live-In`) and visit frequency (`Daily`, `Alternate Days`).
4. **Assigned Primary Staff Member:** Full name, Employee ID (e.g. `EMP-2024-001`), and clinical designation (e.g. `BSN Registered Nurse`).
5. **Shift Date & Time:** Scheduled start and end window.
6. **Clinic Care Manager's Name:** Designated overseeing coordinator (e.g. `Hina Malik`).
7. **Clinical Requirements & Special Instructions:** Vital signs monitoring, IV line maintenance, wound dressing, medication timings, and home access notes.
8. **Assignment Status:** Current operational assignment status (`assigned`, `confirmed`).
9. **Assigned On Date:** Automatic timestamp recording the assignment transaction.
10. **Backup Staff Member:** Mandatory secondary qualified clinician (with Employee ID and Designation) designated for emergency clinical cover and failover.

- **Slide-out Booking Drawer (`BookingDrawer`):**
  - Instant inspection of complete patient clinical dossier, diagnosis, allergy warnings, uploaded prescription image preview or tele-consult flag, and emergency contacts.
  - Interactive OpenStreetMap route view.
  - One-click trigger to launch `NurseAssignPanel` for real-time clinician re-dispatch.

---

### Page 7: Live GPS Field Tracking, Geofencing & SOS Dispatch
- **Component:** `frontend/src/pages/LiveTracking.jsx`
- **Internal Route ID:** `live-tracking`
- **Access Level:** `super_admin`, `admin`, `branch_manager`, `care_manager`
- **Key Features:**
  - **Dual View Modes:** Full-screen interactive map (`MiniMap.jsx` using Leaflet/OSM with smooth pin repositioning) vs dense real-time field operations list.
  - **Live WebSocket Telemetry:** Connected directly to `ws://<host>:8000/ws/tracking/?token=<JWT>` via `useWebSocketTracking` hook. Dispatches live `location_update`, `geofence_event`, `sos`, and `sos_resolved` events with zero polling latency.
  - **Simulation Mode Toggle:** By default, simulation mode is **OFF** (listening strictly to authentic field mobile devices). An on-screen Simulation Mode button allows operators to turn on mock GPS pings on demand for presentations, walkthroughs, or offline training.
  - **4-Stage Status Pipeline:** `Assigned` -> `En Route` -> `In Progress` -> `Completed`.
  - **Live Countdown Timer:** Calculates real-time ETA for en-route clinicians; turns urgent red when arrival is overdue based on alert threshold rules.
  - **Configurable Alert Rules Panel:** Connected directly to `GET /api/tracking/alert-rules/` and `POST /api/tracking/alert-rules/` for server-side persistence:
    - Late Arrival Threshold (default: 15 min).
    - No-Show Threshold (default: 30 min).
    - Visit Overstay Threshold (default: 120 min).
  - **SOS Emergency Incident Dispatch & Siren:**
    - High-visibility sticky pulsating red emergency banner (`.sos-banner-pulsating`) displaying clinician name, patient, coordinates, and panic timestamp.
    - Synthesized Web Audio API two-tone audible alarm chime (`window.playAlarmChime()`) alerting dispatchers immediately.
    - One-click incident resolution modal with reviewer notes and logging (`POST /api/tracking/sos/{id}/resolve/`).
  - **Geofence Audit Log:** Automatic server-side detection and logging of `check_in` and `check_out` timestamps upon crossing patient geofence perimeter (100m radius).


---

### Page 8: Staff & Clinical Workforce Roster (with Staff Profile Dossier)
- **Component:** `frontend/src/pages/Staff.jsx`
- **Internal Route ID:** `staff`
- **Access Level:** `super_admin` (Workforce roster, scheduling, and compensation locked down to Super Admin only)
- **Key Features:**
  - **5 Functional Sub-Tabs:**
    1. `directory`: Searchable staff cards with avatar, specialization, employee ID, contact details, rating stars, and status badges (`available`, `on_visit`, `off_duty`, `on_leave`).
    2. `daily-log`: Derived real-time attendance sheet calculating first check-in, last check-out, visit count, field hours, and overtime hours.
    3. `calendar`: Monthly grid showing clinical roster shifts (`Morning 08:00 - 16:00`, `Evening 16:00 - 00:00`, `Night 00:00 - 08:00`).
    4. `leave`: Leave requests review pipeline (`sick`, `annual`, `casual`, `unpaid`) with one-click Approve / Reject actions.
    5. `payroll`: Attendance threshold configuration and monthly hours reconciliation.
  - **Comprehensive Staff Profile Panel (`StaffProfilePanel.jsx`):**
    - Clicking any staff member slides open a multi-tab clinical dossier drawer:
      - **Tab 1: Overview & Credentials:** Bio, PMDC/PNC license number, emergency contact, assigned branch, and admin account linking.
      - **Tab 2: Shift History & Attendance:** Real-time log of clock-ins, clock-outs, and completed visits.
      - **Tab 3: Route History Map:** Interactive Leaflet route map plotting breadcrumb path of GPS pings fetched from `GET /api/tracking/staff/<id>/route/`.
      - **Tab 4: Clinical Training (LMS):** Live progress indicators across assigned clinical courses (`GET /api/lms/staff/<id>/training/`), passing scores, and completion status.
      - **Tab 5: Earned Certificates:** Full list of accredited credentials (`GET /api/lms/staff/<id>/certificates/`) with instant PDF download and public verification link.
  - **Interactive Digital ID Card (`StaffIdCard.jsx`):**
    - Front face: Organization branding, photo, employee ID, PMDC/PNC QR code, emergency blood group, signature.
    - Back face: Operating rules, central dispatch contact number, and verification URL.
    - One-click physical print button.
  - **Admin-Set Credential Provisioning:**
    - Adding a staff member opens a registration form capturing name, specialization, phone, email, username, and an initial password.
    - Atomically creates both the `Staff` record and a linked Django `User` account with hashed credentials.

---

### Page 9: Patient Directory (EMR)
- **Component:** `frontend/src/pages/Patients.jsx`
- **Internal Route ID:** `patients`
- **Access Level:** `super_admin`, `admin`, `branch_manager`, `care_manager`, `nurse`
- **Key Features:**
  - Complete directory of homecare patients showing MR number, name, age, primary diagnosis, care manager, status, and active care package.
  - Instant text search across patient name, phone, address, and medical record number.
  - **Add Patient Modal:** Captures full demographics, emergency contact, home address with coordinates, blood type, and primary physician.
  - **Edit Patient Modal:** Instant inline modification of medical information.
  - One-click navigation into the full **Patient 360° Dossier**.

---

### Page 10: Patient 360° Comprehensive Dossier (Forms A, B, C)
- **Component:** `frontend/src/pages/Patient360.jsx`
- **Internal Route ID:** `patient-360`
- **Access Level:** `super_admin`, `admin`, `branch_manager`, `care_manager`, `nurse`
- **Header Summary Bar:** Displays patient avatar, MR number, age/gender, blood group, primary diagnosis, assigned care manager, address, and contact numbers.
- **10 Sub-Tabs:**
  1. `overview`: Quick snapshot of active vitals, attending nurse, emergency contacts, and active prescriptions.
  2. `notes` (**Nurses Notes - Form A**): Official clinical progress notes, subjective assessment, objective nursing actions, and patient response.
  3. `vitals` (**Vitals History - Form B**):
     - Comprehensive clinical parameter capture: Blood Pressure (systolic/diastolic), Heart Rate, Temperature, SpO2 (%), Respiratory Rate, Blood Sugar Level (BSR), Weight, Intake (NG/IV fluids), Output (Urine/Drainage), and Insulin administered.
     - **Built-in AI Anomaly Detection:** Real-time flagging of hypertensive crisis, hypoxia (SpO2 < 92%), fever spikes, and severe hypoglycemia/hyperglycemia.
  4. `mar` (**MAR Sheet & PRN Meds - Form C**):
     - 7-day medication administration record grid.
     - Tracks medication name, dosage, route (Oral, IV, IM, SC), frequency, scheduled hour, and nurse sign-off.
     - PRN (as-needed) medication administration logs and clinical indications.
     - Discontinue medication workflow.
  5. `history`: Past medical history, surgical history, known drug allergies, and comorbidities.
  6. `careplan`: Multi-disciplinary goals, wound dressing protocols, and therapy schedules.
  7. `reports`: Attending nurse daily visit reports with uploaded bedside wound photos.
  8. `invoices`: Patient-specific billing ledger (hidden from Nurse role for field-level security).
  9. `payments`: Receipt ledger of bank transfers, cash collections, and credit payments.
  10. `documents`: Uploaded hospital discharge summaries, laboratory reports, and signed consent forms.

---

### Page 11: Specialized Therapy Services
- **Component:** `frontend/src/pages/Therapy.jsx`
- **Internal Route ID:** `therapy`
- **Access Level:** `super_admin`, `admin`, `care_manager`
- **Disciplines Covered:**
  - Physiotherapy (Stroke rehab, mobility training, post-TKR/THR).
  - Speech & Language Therapy (Post-stroke dysphasia, swallowing exercises).
  - Psychotherapy (Home mental wellness, geriatric depression).
  - Dietetics & Clinical Nutrition (Diabetic diet planning, renal nutrition, fluid restriction).
- **Session Cards:** Displays patient name, MR number, attending therapist, scheduled time, duration, session progress tracker (e.g., Session 3 of 8), clinical goals, and rehab progress notes.

---

### Page 12: Admin & Human Resources
- **Component:** `frontend/src/pages/AdminHR.jsx`
- **Internal Route ID:** `admin-hr`
- **Access Level:** `super_admin`, `admin`
- **Sub-Tabs:**
  1. `announcements`: Broadcast system for publishing company-wide alerts, SOP updates, and roster notifications with priority levels (`normal`, `high`).
  2. `docs`: Clinical documentation library housing standard operating procedures (e.g., *Wound Care SOP v3.2*, *Consent Forms*, *Infection Control Protocol*).
  3. `training`: Workforce training modules tracking employee assignments and completion rates (e.g., *Basic Life Support Refresher*, *Dementia Care*).
  4. `salaries`: Monthly staff payroll calculation based on hours worked, overtime pay, deductions, and net salary disbursement status (`pending`, `paid`).
  5. `content`: Public website CMS for creating and modifying published health articles and blogs.

---

### Page 13: Financial Accounts
- **Component:** `frontend/src/pages/Accounts.jsx`
- **Internal Route ID:** `accounts`
- **Access Level:** `super_admin`, `accountant` (Financial ledgers and revenue streams locked down from Admin)
- **Key Features:**
  - Executive Financial KPIs: Total Billed, Total Collected, and Outstanding Balances.
  - **Revenue by Service Line Donut Chart:** Visual breakdown across Nursing Care, Physiotherapy, Doctor Consultations, Elderly Attendant, and Pharmacy Consumables.
  - **30-Day Daily Revenue Bar Chart:** Daily revenue trends with tooltip inspection.
  - Detailed financial ledger table with CSV export capability.

---

### Page 14: Billing & Invoicing
- **Component:** `frontend/src/pages/Billing.jsx`
- **Internal Route ID:** `billing`
- **Access Level:** `super_admin`, `accountant` (Invoicing and payment processing locked down from Admin)
- **Key Features:**
  - Invoice generation for Monthly Care Packages and Per-Visit home visits.
  - Status filtering: `paid`, `partial`, `pending`, `overdue`.
  - **Invoice Detail Drawer:**
    - Branded official invoice preview.
    - Itemized line items with quantity, unit rate, and total sum.
    - Historic payments ledger with reference IDs and payment methods (`Bank Transfer`, `Cash`, `Card`, `POS`).
    - One-click PDF generation and browser print engine.
  - **Record Payment Modal:** Allows cashiers and accountants to record partial or complete payments against any open invoice with transaction reference codes.

---

### Page 15: CRM & Leads Pipeline
- **Component:** `frontend/src/pages/CRM.jsx`
- **Internal Route ID:** `crm`
- **Access Level:** `super_admin`, `admin`, `crm_executive`
- **Interactive Kanban Board:**
  - **4 Pipeline Stages:** `New Lead` (`new_lead`), `Contacted` (`contacted`), `Follow-up` (`follow_up`), and `Converted` (`converted`).
  - **HTML5 Drag & Drop:** Move lead cards between stages with live state updates.
  - Inbound Lead Capture: Automatically receives leads submitted from the Public Website Contact Form and Booking Wizard.
  - **One-Click Lead Conversion:** Modal to convert a lead into a registered patient and generate their first homecare booking automatically.

---

### Page 16: Operational Reports
- **Component:** `frontend/src/pages/Reports.jsx`
- **Internal Route ID:** `reports`
- **Access Level:** `super_admin`, `admin`, `branch_manager`, `accountant`
- **Report Modules:**
  1. `attendance`: Staff attendance matrix across custom date ranges, days present, hours worked, and overtime.
  2. `compliance`: Visit arrival punctuality, on-time percentage, late arrivals, and no-shows.
  3. `revenue`: Financial reconciliation by service stream, tax collected, and outstanding receivables.
  4. `census`: Patient census, monthly admissions, discharges, and primary diagnosis distribution.
- **Export Formats:** Direct CSV download and branded PDF generation.

---

### Page 17: Reports & Analytics
- **Component:** `frontend/src/pages/Analytics.jsx`
- **Internal Route ID:** `analytics`
- **Access Level:** `super_admin`, `admin`, `branch_manager`, `accountant`
- **Key Features:**
  - Interactive Date Range Selector (`dateFrom` to `dateTo`).
  - Comparative Metric Cards showing % change vs. previous operating period:
    - Total Revenue (+14.2%).
    - Total Home Visits (+8.5%).
    - Active Patient Census (+5.0%).
    - Active Field Staff Capacity (100%).
  - Responsive Recharts Visualizations:
    - Revenue Growth Area / Line Chart.
    - Service Distribution Pie Chart.
  - Universal Print Button: Generates comprehensive executive analytics reports.

---

### Page 18: Settings & User Management
- **Component:** `frontend/src/pages/UserManagement.jsx`
- **Internal Route ID:** `users`
- **Access Level:** `super_admin` only (System credentials, permissions matrix, and audit logs locked down exclusively to Super Admin)
- **Sub-Tabs:**
  1. `users`: System user accounts table showing full name, email, phone, role badge, branch assignment, active/suspended status, and last login.
     - Add User Modal: Creates accounts with admin-set passwords.
     - Account Actions: Suspend / Activate account, Reset Password, and Delete (Super Admin only).
  2. `permissions`: Interactive **Role Permission Matrix** allowing Super Admins to toggle View (`V`), Add (`A`), Edit (`E`), and Delete (`D`) permissions across Bookings, Patients, Billing, Staff, and User Management.
  3. `audit`: **Immutable Security Audit Trail** recording actor name, action performed (e.g., *Created Account*, *Suspended Account*, *Updated Permissions*), target account, and timestamp.

---

### Page 19: Clinical LMS (Learning Management System) & Certification Studio
- **Component:** `frontend/src/pages/LMS.jsx`
- **Internal Route ID:** `lms`
- **Access Level:** `super_admin`, `admin`, `care_manager`, `nurse`
- **Sub-Components:**
  - `CertificateHistoryTable.jsx`: Filterable/searchable certificate history ledger with instant QR verification links, PDF re-downloads, and revocation workflows.
  - `VideoPlayerModal.jsx`: Video lecture player with real-time watch duration tracking and API progress sync.
- **5 Functional Sub-Tabs:**
  1. `catalog` (**Course Catalog**):
     - Comprehensive continuing medical education (CME) and CEU training courses (e.g., *Basic Life Support & CPR Refresher*, *Advanced Wound Debridement & Negative Pressure*, *Infection Control & Biohazard Protocols*, *Palliative Pain Management & Symptom Control*).
     - Filter by clinical discipline, difficulty level (Beginner, Intermediate, Advanced), and CEU credit hours.
     - Module breakdown displaying lecture counts, duration, passing grade requirement, and accreditation bodies.
     - One-click course enrollment.
  2. `my-learning` (**Clinician Learning Portal**):
     - Tailored dashboard showing enrolled courses, mandatory training deadlines, completed lessons, and active course progress bars.
     - Launch interactive video player (`VideoPlayerModal.jsx`) which pings backend lecture progress every 15 seconds (`POST /api/lms/lectures/{id}/progress/`).
     - Post-lecture knowledge assessments with automatic score calculation and minimum passing grade evaluation.
  3. `generator` (**Accredited Certificate Generator Studio**):
     - Interactive design studio for generating accredited clinical credentials.
     - **Live SVG Vector Preview:** WYSIWYG certificate preview rendering real-time design changes (recipient name, achievement title, dates, seals, and signatures).
     - **Recipient Picker:** Linked directly to staff database with auto-filled staff ID, designation, and branch.
     - **Certificate Types:** `course_completion`, `cpr_bls`, `infection_control`, `wound_care`, `general_achievement`.
     - **Accreditation Seals:** Toggleable authentic regulatory badges (Islamabad Healthcare Regulatory Authority - IHRA, Securities & Exchange Commission of Pakistan - SECP).
     - **Digital Signatures & Issuance:** Configurable signatory authority name, title (e.g. *Chief Medical Officer*), styled signature script, issue date, and optional expiration date.
     - **One-Click Generation & Storage:** Submits to `POST /api/lms/certificates/`, creating a unique verification code (e.g. `CERT-BLS-2026-0042`), digital signature SHA-256 hash, and high-resolution QR code linking to `/verify/{code}`.
  4. `history` (**Certificate History & Audit Ledger**):
     - Complete tabular ledger powered by `CertificateHistoryTable.jsx`.
     - Columns: Certificate ID, Recipient Clinician, Course/Achievement, Issue Date, Expiration Date, Grade, Status Badge (`Active`, `Revoked`, `Expired`).
     - Instant Actions:
       - **Download PDF:** Fetches pixel-perfect ReportLab vector PDF from `/api/lms/certificates/{id}/pdf/`.
       - **Copy Public Verification Link:** Copies public QR validation URL to clipboard.
       - **View Public Verification:** Navigates directly to `public-verification` / `/verify/{code}`.
       - **Revoke / Reissue:** Administrative dialog to revoke a certificate with mandatory clinical justification audit log.
  5. `analytics` (**Workforce Training Analytics**):
     - Departmental compliance KPIs: Total Certified Clinicians, Pending Mandatory Certifications, Expiring Accreditations within 30 days, and Course Completion Rates.
     - Visual charts showing CEU credit distribution and clinical competency breakdown.

---

## 4. Backend API Reference (Every Endpoint & URL)

Base URL: `http://localhost:8000` (or production host)  
Schema: OpenAPI 3.0 / Swagger 2.0  
Headers: `Authorization: Bearer <JWT_ACCESS_TOKEN>` (for protected endpoints)

```
===================================================================================================
                                BACKEND API URL REGISTRY
===================================================================================================
├── System & Documentation
│   ├── GET  /django-admin/
│   ├── GET  /api/schema/
│   └── GET  /api/docs/
├── Authentication (`/api/auth/`)
│   ├── POST /api/auth/login/
│   ├── POST /api/auth/refresh/
│   ├── GET  /api/auth/me/
│   ├── POST /api/auth/forgot-password/
│   ├── POST /api/auth/verify-otp/
│   └── POST /api/auth/reset-password/
├── Bookings App (`/api/bookings/`)
│   ├── GET/POST       /api/bookings/
│   ├── GET/PUT/DELETE /api/bookings/{id}/
│   ├── GET            /api/bookings/today/
│   ├── GET            /api/bookings/active/
│   ├── GET            /api/bookings/stats/
│   └── POST           /api/bookings/{id}/assign_staff/
├── Staff App (`/api/staff/`)
│   ├── GET/POST       /api/staff/members/
│   ├── GET/PUT/DELETE /api/staff/members/{id}/
│   ├── GET            /api/staff/members/available/
│   ├── GET            /api/staff/members/on_visit/
│   ├── GET            /api/staff/members/{id}/attendance/
│   ├── GET/POST       /api/staff/leave-requests/
│   ├── POST           /api/staff/leave-requests/{id}/approve/
│   ├── POST           /api/staff/leave-requests/{id}/reject/
│   └── GET/POST       /api/staff/attendance/
├── Patients App (`/api/patients/`)
│   ├── GET/POST       /api/patients/
│   ├── GET/PUT/DELETE /api/patients/{id}/
│   ├── GET            /api/patients/{id}/timeline/
│   ├── GET            /api/patients/{id}/vitals/
│   ├── GET            /api/patients/{id}/nurse_notes/
│   ├── GET            /api/patients/{id}/labs/
│   ├── GET            /api/patients/{id}/prescriptions/
│   ├── POST           /api/patients/{id}/daily-report/
│   ├── GET            /api/patients/{id}/mar/due-today/
│   ├── POST           /api/patients/{id}/mar/administer/
│   ├── GET/POST       /api/patients/prescriptions/
│   ├── GET/POST       /api/patients/vitals/
│   ├── GET/POST       /api/patients/notes/
│   └── GET/POST       /api/patients/labs/
├── Tracking App (`/api/tracking/`)
│   ├── GET            /api/tracking/geofence-events/
│   ├── GET/POST       /api/tracking/sos/
│   ├── GET            /api/tracking/sos/active/
│   ├── POST           /api/tracking/sos/{id}/resolve/
│   ├── GET/POST       /api/tracking/alert-rules/
│   ├── GET            /api/tracking/live-visits/
│   ├── POST           /api/tracking/gps-ping/
│   ├── POST           /api/tracking/check-in/
│   ├── POST           /api/tracking/check-out/
│   └── GET            /api/tracking/staff/{id}/route/
├── Accounts App (`/api/accounts/`)
│   ├── GET/POST       /api/accounts/payments/
│   ├── GET            /api/accounts/payments/revenue_by_service/
│   ├── GET            /api/accounts/payments/daily_revenue/
│   └── GET/POST       /api/accounts/invoices/
├── Billing App (`/api/billing/`)
│   ├── GET/POST       /api/billing/invoices/
│   ├── GET/PUT/DELETE /api/billing/invoices/{id}/
│   ├── POST           /api/billing/invoices/{id}/record_payment/
│   ├── GET            /api/billing/invoices/summary/
│   └── GET/POST       /api/billing/payments/
├── CRM App (`/api/crm/`)
│   ├── GET/POST       /api/crm/leads/
│   ├── GET/PUT/DELETE /api/crm/leads/{id}/
│   ├── POST           /api/crm/leads/{id}/update_stage/
│   ├── POST           /api/crm/leads/{id}/add_activity/
│   └── GET/POST       /api/crm/activities/
├── Clinical LMS App (`/api/lms/`)
│   ├── GET/POST       /api/lms/courses/
│   ├── GET/PUT/DELETE /api/lms/courses/{id}/
│   ├── GET/POST       /api/lms/lectures/
│   ├── POST           /api/lms/lectures/{id}/progress/
│   ├── GET/POST       /api/lms/assignments/
│   ├── GET/POST       /api/lms/certificates/
│   ├── POST           /api/lms/certificates/{id}/revoke/
│   ├── GET            /api/lms/staff/{id}/training/
│   ├── GET            /api/lms/staff/{id}/certificates/
│   └── GET            /api/lms/verify/{certificate_id}/
├── Public Certificate Verification (`/api/certificates/`)
│   └── GET            /api/certificates/verify/{certificate_id}/
├── Patient/Family Portal App (`/api/portal/`)
│   ├── GET /api/portal/my/patient_profile/
│   ├── GET /api/portal/my/visits/
│   └── GET /api/portal/my/invoices/
└── Notifications App (`/api/notifications/`)
    ├── GET  /api/notifications/
    ├── POST /api/notifications/{id}/read/
    ├── POST /api/notifications/read-all/
    └── GET  /api/notifications/unread-count/
===================================================================================================
```

---

### Core & Documentation URLs

#### 1. `GET /django-admin/`
- **Description:** Django standard administration portal for system administrators.
- **Authentication:** Django Superuser session.

#### 2. `GET /api/schema/`
- **Description:** OpenAPI 3.0 YAML/JSON specification endpoint generated by `drf-spectacular`.

#### 3. `GET /api/docs/`
- **Description:** Interactive Swagger UI documentation interface. Allows live testing of all API endpoints directly in the browser.

---

### Authentication Endpoints (`/api/auth/`)

#### 1. `POST /api/auth/login/`
- **Description:** Authenticates credentials and issues JSON Web Token pair (access & refresh).
- **Request Body:**
  ```json
  {
    "username": "admin@homecareos.com",
    "password": "your_secure_password"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

#### 2. `POST /api/auth/refresh/`
- **Description:** Refreshes an expired access token using a valid refresh token.
- **Request Body:**
  ```json
  {
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

#### 3. `GET /api/auth/me/`
- **Description:** Returns the authenticated user's profile, role, platform permissions, and linked staff ID. Required on mobile/web app startup.
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
  ```json
  {
    "id": 5,
    "username": "nurse1",
    "email": "nurse1@homecareos.com",
    "full_name": "Nurse Fatima Zahra",
    "role": "nurse",
    "role_display": "Nurse",
    "platform_allowed": "all",
    "staff_id": 2,
    "specialization": "Critical Care",
    "phone_number": "+92-300-1234567"
  }
  ```

#### 4. `POST /api/auth/forgot-password/`
- **Description:** Sends a 6-digit OTP code to the clinician's registered email or phone.
- **Request Body:** `{"identifier": "nurse1@homecareos.com"}`
- **Response (200 OK):** `{"detail": "OTP sent successfully."}`

#### 5. `POST /api/auth/verify-otp/`
- **Description:** Validates the OTP code and returns a short-lived `reset_token`.
- **Request Body:** `{"identifier": "nurse1@homecareos.com", "otp": "123456"}`
- **Response (200 OK):** `{"reset_token": "valid-single-use-token-uuid"}`

#### 6. `POST /api/auth/reset-password/`
- **Description:** Sets a new password using the validated `reset_token`.
- **Request Body:** `{"reset_token": "valid-single-use-token-uuid", "new_password": "NewSecretPassword123!"}`
- **Response (200 OK):** `{"detail": "Password successfully reset."}`

---

### Bookings API (`/api/bookings/`)

#### 1. `GET /api/bookings/`
- **Description:** List all bookings with filtering, search, and pagination.
- **Query Parameters:**
  - `status`: Filter by status (`pending`, `assigned`, `en_route`, `in_progress`, `completed`, `cancelled`, `late`, `no_show`).
  - `service_type`: Filter by service (`short_service`, `medicine_delivery`, `long_term`, `long_term_admission`).
  - `search`: Search patient name, MR number, or assigned staff.
  - `ordering`: Sort by field (e.g., `-scheduled_time`, `amount`).
- **Response (200 OK):** Array of `BookingListSerializer` objects.

#### 2. `POST /api/bookings/`
- **Description:** Create a new homecare visit booking.
- **Request Body:**
  ```json
  {
    "patient": 1,
    "assigned_staff": 2,
    "service_type": "short_service",
    "scheduled_time": "2026-09-10T10:00:00Z",
    "amount": 2500,
    "payment_status": "pending",
    "notes": "Patient requires IV cannula replacement and vitals check."
  }
  ```

#### 3. `GET /api/bookings/{id}/`
- **Description:** Retrieve detailed booking profile including full patient demographics, nurse contact, timing audit, and notes.

#### 4. `PUT /api/bookings/{id}/` & `PATCH /api/bookings/{id}/`
- **Description:** Update visit status, notes, or payment details.

#### 5. `DELETE /api/bookings/{id}/`
- **Description:** Cancel and remove a booking (Super Admin only).

#### 6. `GET /api/bookings/today/`
- **Description:** Convenience endpoint returning all visits scheduled for the current calendar date.

#### 7. `GET /api/bookings/active/`
- **Description:** Returns all bookings currently active in the field (`status` in `en_route` or `in_progress`).

#### 8. `POST /api/bookings/{id}/assign_staff/`
- **Description:** Assigns or reassigns a field staff member to an existing booking.
- **Request Body:** `{"staff_id": 3}`
- **Response (200 OK):** Updated booking detail object with status automatically transitioned to `assigned`.

#### 9. `GET /api/bookings/stats/`
- **Description:** High-speed aggregated metrics for top-level operational dashboards.
- **Response (200 OK):**
  ```json
  {
    "active_visits": 3,
    "today_bookings": 12,
    "pending_assignments": 2,
    "today_revenue": 145000
  }
  ```

---

### Staff & HR API (`/api/staff/`)

#### 1. `GET /api/staff/members/`
- **Description:** Lists all active staff members and clinicians with roles, branch assignments, and status.

#### 2. `POST /api/staff/members/`
- **Description:** Register a new clinical staff member (Doctor, Nurse, Physiotherapist, Care Manager).

#### 3. `GET /api/staff/members/{id}/`
- **Description:** Detailed profile of staff member, including PNC/PMDC certifications, rating, and assigned patient list.

#### 4. `GET /api/staff/members/available/`
- **Description:** Returns clinicians currently available for immediate dispatch (`status = 'available'`).

#### 5. `GET /api/staff/members/on_visit/`
- **Description:** Returns clinicians currently actively engaged in field visits (`status = 'on_visit'`).

#### 6. `GET /api/staff/members/{id}/attendance/`
- **Description:** Retrieves the last 60 attendance records for a specific staff member.

#### 7. `GET /api/staff/leave-requests/` & `POST /api/staff/leave-requests/`
- **Description:** List and submit workforce leave applications (`sick`, `annual`, `casual`, `unpaid`).

#### 8. `POST /api/staff/leave-requests/{id}/approve/`
- **Description:** Approves leave request, transitions status to `approved`, and records `reviewed_by`.

#### 9. `POST /api/staff/leave-requests/{id}/reject/`
- **Description:** Rejects leave request and records `reviewed_by`.

#### 10. `GET /api/staff/attendance/`
- **Description:** Tabular attendance records across all field personnel.

---

### Patients & EMR API (`/api/patients/`)

#### 1. `GET /api/patients/` & `POST /api/patients/`
- **Description:** List active patient medical records or register a new patient dossier.

#### 2. `GET /api/patients/{id}/`
- **Description:** 360-degree patient dossier including emergency contacts, diagnoses, and attending care managers.

#### 3. `GET /api/patients/{id}/timeline/`
- **Description:** Reverse-chronological timeline of all historical visits, care notes, and interventions for this patient.

#### 4. `GET /api/patients/{id}/vitals/`
- **Description:** Retrieves historical vital signs recordings for Form B charting.

#### 5. `GET /api/patients/{id}/nurse_notes/`
- **Description:** Retrieves Form A clinical progress notes written by attending nurses.

#### 6. `GET /api/patients/{id}/labs/`
- **Description:** Retrieves all diagnostic laboratory results linked to this patient.

#### 7. `GET /api/patients/{id}/prescriptions/`
- **Description:** Retrieves active and past medical prescriptions.

#### 8. `GET/POST /api/patients/vitals/`
- **Description:** Create or query vitals sign entries across all patients. Supports systolic, diastolic, pulse, temperature, SpO2, respiratory rate, blood sugar, weight, fluid intake, fluid output, and insulin.

#### 9. `GET/POST /api/patients/notes/`
- **Description:** Create or query clinical nurse notes (Form A).

#### 10. `GET/POST /api/patients/labs/`
- **Description:** Upload laboratory findings, reference ranges, and test dates.

#### 11. `POST /api/patients/{id}/daily-report/`
- **Description:** Mobile field endpoint allowing attending nurses to submit a comprehensive daily shift report with care checklist, wound observation notes, and multipart photo uploads.
- **Content-Type:** `multipart/form-data`
- **Payload Fields:** `notes`, `checklist` (JSON), `photos` (multiple image files).
- **Side Effect:** Automatically creates a `NurseNote` (Form A) linked to the patient's EMR record.

#### 12. `GET /api/patients/{id}/mar/due-today/`
- **Description:** Medication Administration Record (MAR). Returns active prescriptions scheduled for today with dosage, timing, and an `administered` boolean flag.
- **Response (200 OK):**
  ```json
  [
    {
      "prescription_id": 14,
      "medication_name": "Ceftriaxone IV",
      "dosage": "1g",
      "route": "IV Infusion",
      "scheduled_time": "14:00",
      "administered": false,
      "administered_at": null,
      "administered_by": null
    }
  
  ```

#### 13. `POST /api/patients/{id}/mar/administer/`
- **Description:** Confirms clinical administration of a scheduled medication dose.
- **Request Body:** `{"prescription_id": 14, "day_number": 3}`
- **Response:** `201 Created` with MAR administration record; `409 Conflict` if dose was already administered today.

---

### Tracking, Geofencing & SOS API (`/api/tracking/`)

#### 1. `GET /api/tracking/geofence-events/`
- **Description:** Audit trail of geofence perimeter events.
- **Query Parameters:** `booking_id`, `staff_id`, `event_type` (`check_in`, `check_out`, `breach`).

#### 2. `GET /api/tracking/sos/` & `POST /api/tracking/sos/`
- **Description:** Retrieve historic SOS triggers or initiate a panic distress signal from a clinician's mobile device.
- **Auto Staff Association:** When invoked by an authenticated clinician, automatically binds `staff` to their authenticated `staff_profile` if not explicitly specified.
- **Request Body (POST):** `{"booking_id": 12, "lat": 24.8607, "lng": 67.0104, "reason": "Patient acute distress"}`
- **Side Effect:** Immediately broadcasts `{ "type": "sos", ... }` through Django Channels to trigger the dashboard audible alarm and pulsating banner.

#### 3. `GET /api/tracking/sos/active/`
- **Description:** Returns currently unresolved emergency panic alerts requiring central dispatch intervention (`resolved = False`).

#### 4. `POST /api/tracking/sos/{id}/resolve/`
- **Description:** Resolves an active SOS distress incident.
- **Request Body:**
  ```json
  {
    "notes": "Spoke with Nurse Sarah via phone. False alarm triggered by mobile pocket press. Situation normal."
  }
  ```
- **Side Effect:** Sets `resolved = True`, records timestamp and `resolved_by = request.user`, and broadcasts `sos_resolved` over WebSocket to clear dashboard banners.

#### 5. `GET /api/tracking/alert-rules/` & `GET /api/tracking/alert-rules/current/` & `POST /api/tracking/alert-rules/`
- **Description:** Read and update operational delay and overstay alert threshold rules.
- **`GET /api/tracking/alert-rules/current/`:** Returns the latest configured operational thresholds:
  ```json
  {
    "id": 1,
    "late_threshold_minutes": 15,
    "no_show_threshold_minutes": 30,
    "overstay_threshold_minutes": 120,
    "created_at": "2026-09-11T19:10:00Z"
  }
  ```
- **`POST /api/tracking/alert-rules/`:** Creates a new active rule configuration that immediately takes effect across the dashboard.

#### 6. `GET /api/tracking/live-visits/`
- **Description:** Real-time location stream of all active field staff with current latitude, longitude, heading, status, and battery level, ordered by `['-created_at']`.
- **Response Format:**
  ```json
  [
    {
      "id": 1,
      "booking": 12,
      "staff_name": "Nurse Fatima Zahra",
      "patient_name": "Ahmed Khan",
      "current_lat": 24.8607,
      "current_lng": 67.0104,
      "status": "in_progress",
      "eta_minutes": 0,
      "battery_level": 85,
      "last_ping": "2026-09-11T19:10:30Z"
    }
  ]
  ```

#### 7. `POST /api/tracking/gps-ping/`
- **Description:** Background location update endpoint called by the mobile app every 30 seconds while the clinician is on duty. Automatically performs geofence calculations against the target booking address.
- **Request Body:** `{"booking_id": 12, "lat": 24.8607, "lng": 67.0104}`
- **Side Effect:** Updates `LiveVisit` coordinates, broadcasts position to the Web Dashboard map via WebSocket (`location_update`), and triggers automatic check-in (`geofence_event`) if distance to patient is ≤ 100 meters.

#### 8. `POST /api/tracking/check-in/`
- **Description:** Clinician arrival check-in at the patient's home (manual fallback or geofence trigger). Transitions booking status to `in_progress`.
- **Idempotency:** Re-issuing check-in for an already checked-in visit safely returns HTTP `200 OK` with the existing check-in timestamp without corrupting data or throwing errors.
- **Request Body:** `{"booking_id": 12, "lat": 24.8607, "lng": 67.0104, "method": "manual"}`
- **Response (200 OK):** `{"status": "checked_in", "timestamp": "2026-09-07T14:02:00Z"}`

#### 9. `POST /api/tracking/check-out/`
- **Description:** Clinician departure and visit completion. Transitions booking status to `completed`, computes actual visit duration, and cleans up transient `LiveVisit` records.
- **Request Body:** `{"booking_id": 12, "lat": 24.8607, "lng": 67.0104}`
- **Response (200 OK):** `{"status": "checked_out", "visit_duration_minutes": 58}`

#### 10. `GET /api/tracking/staff/{staff_id}/route/`
- **Description:** Returns the chronological GPS breadcrumb route history for a clinician across recent field shifts.
- **Parameters:** `staff_id` (Integer Staff PK), optional `date` (`YYYY-MM-DD`).
- **Response (200 OK):**
  ```json
  [
    {
      "lat": 33.6844,
      "lng": 73.0479,
      "timestamp": "2026-09-14T08:30:15Z",
      "speed": 22.4,
      "battery": 92
    },
    {
      "lat": 33.6890,
      "lng": 73.0512,
      "timestamp": "2026-09-14T08:35:15Z",
      "speed": 18.1,
      "battery": 91
    }
  ]
  ```
- **Usage:** Rendered by `StaffProfilePanel.jsx` on an interactive Leaflet polyline map to review shift movement and route compliance.

---

### Accounts & Financial Reports API (`/api/accounts/`)

#### 1. `GET /api/accounts/payments/`
- **Description:** Master ledger of all payments received across all service channels.

#### 2. `GET /api/accounts/payments/revenue_by_service/`
- **Description:** Aggregates gross revenue and total visit volume grouped by clinical service stream.

#### 3. `GET /api/accounts/payments/daily_revenue/`
- **Description:** 30-day chronological breakdown of gross daily cash collections for trend forecasting.

#### 4. `GET /api/accounts/invoices/`
- **Description:** Accounts receivable invoice ledger.

---

### Billing & Invoicing API (`/api/billing/`)

#### 1. `GET /api/billing/invoices/`
- **Description:** Filterable invoice registry.
- **Query Parameters:** `status` (`paid`, `partial`, `pending`, `overdue`), `patient`, `date_from`, `date_to`.

#### 2. `POST /api/billing/invoices/`
- **Description:** Generate a new invoice with itemized line items.

#### 3. `GET /api/billing/invoices/{id}/`
- **Description:** Complete invoice breakdown including patient address, line items, discounts, taxes, and payment history.

#### 4. `POST /api/billing/invoices/{id}/record_payment/`
- **Description:** Record cash, card, or bank transfer payments against an invoice.
- **Request Body:**
  ```json
  {
    "amount": 40000,
    "method": "bank_transfer",
    "reference": "IBFT-994821",
    "notes": "Advance payment for August nursing package."
  }
  ```

#### 5. `GET /api/billing/invoices/summary/`
- **Description:** High-level summary of total invoiced, total collected, and pending invoice count.

---

### CRM & Lead Lifecycle API (`/api/crm/`)

#### 1. `GET /api/crm/leads/` & `POST /api/crm/leads/`
- **Description:** Retrieve CRM pipeline leads or capture a new inbound web/phone inquiry.

#### 2. `GET /api/crm/leads/{id}/`
- **Description:** Detailed lead dossier including call notes, communication logs, and needed care services.

#### 3. `POST /api/crm/leads/{id}/update_stage/`
- **Description:** Moves a lead between pipeline stages (`new_lead`, `contacted`, `follow_up`, `converted`).
- **Request Body:** `{"stage": "contacted"}`

#### 4. `POST /api/crm/leads/{id}/add_activity/`
- **Description:** Adds a call note or follow-up note to the lead's activity history.
- **Request Body:** `{"note": "Called family. Requested doctor visit on Saturday."}`

---

### Patient/Family Portal API (`/api/portal/`)

#### 1. `GET /api/portal/my/patient_profile/`
- **Description:** Returns the authenticated family's patient profile, care team, and emergency instructions.
- **Query Parameter:** `patient_id` (defaults to authenticated user's linked patient).

#### 2. `GET /api/portal/my/visits/`
- **Description:** Returns scheduled and completed visits for the family's patient.

#### 3. `GET /api/portal/my/invoices/`
- **Description:** Returns itemized billing statements and payment statuses for the family's patient.

---

### Notifications API (`/api/notifications/`)

#### 1. `GET /api/notifications/`
- **Description:** Returns chronological list of alerts and notifications for the authenticated staff or administrator.
- **Filter Parameters:** `unread=true`
- **Response (200 OK):**
  ```json
  [
    {
      "id": 8,
      "title": "New Booking Assigned",
      "message": "You have been assigned to Patient Bilal Tariq for today at 15:00.",
      "notification_type": "booking_assigned",
      "is_read": false,
      "created_at": "2026-09-07T13:45:00Z"
    }
  ]
  ```

#### 2. `POST /api/notifications/{id}/read/`
- **Description:** Marks an individual notification as read.
- **Response (200 OK):** `{"status": "marked_read"}`

#### 3. `POST /api/notifications/read-all/`
- **Description:** Marks all pending notifications for the current user as read.
- **Response (200 OK):** `{"status": "all_marked_read"}`

#### 4. `GET /api/notifications/unread-count/`
- **Description:** Lightweight polling endpoint returning badge count of unread alerts.
- **Response (200 OK):** `{"unread": 3}`

---

### Clinical LMS & Continuing Education API (`/api/lms/`)

#### 1. `GET /api/lms/courses/` & `POST /api/lms/courses/`
- **Description:** List accredited clinical courses or author a new training course with passing score and CEU credits.
- **Query Parameters:** `category`, `difficulty`, `is_active`.
- **Response (200 OK):**
  ```json
  [
    {
      "id": 1,
      "title": "Basic Life Support & CPR Refresher (AHA 2026)",
      "slug": "bls-cpr-refresher",
      "category": "emergency",
      "difficulty": "beginner",
      "ceu_credits": 4.0,
      "duration_minutes": 120,
      "passing_score": 80,
      "total_lectures": 6,
      "is_active": true
    }
  ]
  ```

#### 2. `GET/PUT/DELETE /api/lms/courses/{id}/`
- **Description:** Retrieve full course curriculum including ordered lecture modules, assessment criteria, and enrolled staff counts.

#### 3. `GET/POST /api/lms/lectures/`
- **Description:** Query or create video lectures within a course module.

#### 4. `POST /api/lms/lectures/{id}/progress/`
- **Description:** Real-time watch progress telemetry sent by `VideoPlayerModal.jsx` (every 15 seconds).
- **Request Body:**
  ```json
  {
    "watched_seconds": 450,
    "total_seconds": 600,
    "completed": false
  }
  ```
- **Side Effect:** Automatically recalculates `CourseAssignment.progress_percentage` and marks assignment completed if all modules finish with passing score.

#### 5. `GET/POST /api/lms/assignments/`
- **Description:** Enroll staff in courses or query clinical training assignments across the workforce.

#### 6. `GET /api/lms/certificates/` & `POST /api/lms/certificates/`
- **Description:** Query issued certificates or issue an accredited certificate with cryptographic digital signature and QR verification code.
- **Request Body (POST):**
  ```json
  {
    "staff": 2,
    "course": 1,
    "certificate_type": "cpr_bls",
    "achievement_title": "Basic Life Support & CPR Provider",
    "issue_date": "2026-09-14",
    "expiry_date": "2028-09-14",
    "grade": "96%",
    "signatory_name": "Dr. Sarah Mansoor",
    "signatory_title": "Chief Medical Officer",
    "accreditations": ["IHRA", "SECP"]
  }
  ```
- **Response (201 Created):** Returns generated `certificate_id` (e.g., `CERT-BLS-2026-0042`), `verification_url`, `qr_code` data URI, and PDF download endpoint.

#### 7. `POST /api/lms/certificates/{id}/revoke/`
- **Description:** Administratively revokes a certificate with required justification.
- **Request Body:** `{"reason": "Audit failed: missing practical skills sign-off"}`
- **Side Effect:** Sets `revoked = True`, timestamps revocation, and updates public verification page to display `"REVOKED / INVALID"`.

#### 8. `GET /api/lms/staff/{staff_id}/training/`
- **Description:** Returns clinical course progress, CEU credit sum, and pending requirements for a specific clinician (consumed by `StaffProfilePanel.jsx`).

#### 9. `GET /api/lms/staff/{staff_id}/certificates/`
- **Description:** Returns all accredited credentials issued to a clinician with one-click PDF reprint links.

---

### Public Real-Time Certificate Verification (`/api/certificates/verify/`)

#### 1. `GET /api/certificates/verify/{certificate_id}/` (also `/api/lms/verify/{certificate_id}/`)
- **Description:** Public, unauthenticated verification endpoint supporting QR scanning and instant credential validation.
- **Response (200 OK — Active):**
  ```json
  {
    "status": "valid",
    "certificate_id": "CERT-BLS-2026-0042",
    "recipient_name": "Nurse Fatima Zahra",
    "staff_id": 2,
    "employee_id": "HC-NUR-002",
    "course_title": "Basic Life Support & CPR Refresher",
    "certificate_type": "cpr_bls",
    "issue_date": "2026-09-14",
    "expiry_date": "2028-09-14",
    "is_expired": false,
    "revoked": false,
    "issuing_authority": "eHealth Hospital at Home / HomeCare OS",
    "accreditation": "Registered with Islamabad Healthcare Regulatory Authority (IHRA) & SECP",
    "signature_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
  ```
- **Response (200 OK — Revoked):**
  ```json
  {
    "status": "revoked",
    "certificate_id": "CERT-BLS-2026-0042",
    "revoked": true,
    "revoked_at": "2026-09-15T10:00:00Z",
    "revoke_reason": "License suspended by regulatory authority"
  }
  ```
- **Response (404 Not Found):** `{"status": "invalid", "detail": "Certificate ID not recognized in authentic registry."}`

---

## 5. Universal PDF Generation & Printing Subsystem

HomeCare OS incorporates a dual-mode document generation engine:
1. **Client-Side High-Fidelity Print Engine (`UniversalPrintButton.jsx`):**
   - Automatically injects specialized CSS `@media print` stylesheets.
   - Hides topbars, sidebars, and interactive buttons.
   - Formats clean, letterhead-ready documents with official typography, borders, and signatures.
2. **Server-Side Python Engine (`backend/reports/pdf_generator.py`):**
   - Powered by ReportLab.
   - Generates pixel-perfect, tamper-resistant PDF documents for:
     - Patient 360° Profile Summaries.
     - Nurse Daily Patient Visit Reports.
     - Formal Tax Invoices.
     - Staff Monthly Attendance Summaries.
     - Leave Approval Slips.
     - Executive Analytics Reports.
     - **Official Clinical Certificates (`report_type='certificate'`):** Landscape A4 vector output with deep purple/gold branding, dual regulatory seals (IHRA / SECP), dynamic recipient wording, authorized signatory line, and embedded verification QR code.

### High-Fidelity Official Accredited Certificate Generator

- **Implementation:** `HomeCarePDFGenerator._generate_official_certificate(buffer)`
- **Page Layout:** Landscape A4 (`297mm x 210mm`) with precision bleed margins.
- **Palette:**
  - Deep Purple (`#5B1A4A`), Dark Purple facet (`#441337`), Mid Purple (`#7A2359`).
  - Warm Gold Accent (`#D4A94A`), Light Gray overlapping geometric accents (`#E5E7EB`).
- **Geometric Corner Flourishes:** Custom ReportLab canvas paths drawing multi-layered interlocking geometric triangles and diagonal gold pinstripes across top-left and bottom-right corners.
- **Header & Branding:** Interlocking eHealth cross emblem, bold gold wordmark, and `"HOSPITAL AT HOME"` clinical subtitle.
- **Accreditation Seals:**
  - Top Right: `"Registered with Islamabad Healthcare Regulatory Authority (IHRA)"`.
  - Bottom Right: `"Registered with Securities and Exchange Commission of Pakistan (SECP)"`.
- **Dynamic Content:** Certificate for `<Achievement Title>`, `"This is to certify that"`, Recipient Legal Name, Course details, Issue Date, and Expiration Date.
- **Signatory & Verification:** Authorized signature line (`Chief Medical Officer`), Digital Signature SHA-256 hash, and live embedded vector QR code linking to `/verify/{certificate_id}`.

---

## 6. Data Models & Entity-Relationship Schema

### Core Clinical Schema

```
+-------------------+        1:N        +-------------------+
|      Patient      | ----------------< |      Booking      |
|-------------------|                   |-------------------|
| id (PK)           |                   | id (PK)           |
| mr_number (Unique)|                   | patient_id (FK)   |
| first_name        |                   | staff_id (FK)     |
| last_name         |                   | service_type      |
| age, gender       |                   | status            |
| address, lat, lng |                   | scheduled_time    |
| blood_type        |                   | amount            |
+---------+---------+                   +---------+---------+
          |                                       |
          | 1:N                                   | 1:N
          v                                       v
+-------------------+                   +-------------------+
|     VitalSign     |                   |   GeofenceEvent   |
|-------------------|                   |-------------------|
| id (PK)           |                   | id (PK)           |
| patient_id (FK)   |                   | booking_id (FK)   |
| recorded_by (FK)  |                   | staff_id (FK)     |
| systolic, diastol |                   | event_type        |
| pulse, temp, spo2 |                   | timestamp         |
+-------------------+                   +-------------------+
          |
          | 1:N
          v
+-------------------+        1:N        +-------------------+
|      Invoice      | ----------------< |   InvoiceItem     |
|-------------------|                   |-------------------|
| id (PK)           |                   | id (PK)           |
| invoice_number    |                   | invoice_id (FK)   |
| patient_id (FK)   |                   | description       |
| total, amount_paid|                   | quantity, unit_pr |
+-------------------+                   +-------------------+
```

### LMS & Certification Schema

```
+-------------------+        1:N        +-------------------+
|      Course       | ----------------< |      Lecture      |
|-------------------|                   |-------------------|
| id (PK)           |                   | id (PK)           |
| title, slug       |                   | course_id (FK)    |
| category          |                   | title, video_url  |
| difficulty        |                   | duration_seconds  |
| ceu_credits       |                   | order, resources  |
| passing_score     |                   +-------------------+
+---------+---------+                             |
          |                                       |
          | 1:N                                   | 1:N
          v                                       v
+-------------------+        1:N        +-------------------+
| CourseAssignment  | ----------------< |  LectureProgress  |
|-------------------|                   |-------------------|
| id (PK)           |                   | id (PK)           |
| staff_id (FK)     |                   | assignment_id(FK) |
| course_id (FK)    |                   | lecture_id (FK)   |
| progress_pct      |                   | watched_seconds   |
| status, score     |                   | completed (bool)  |
| enrolled_at       |                   +-------------------+
| completed_at      |
+---------+---------+
          |
          | 1:1
          v
+-------------------+
|    Certificate    |
|-------------------|
| id (PK)           |
| certificate_id    | (e.g. CERT-BLS-2026-0042)
| staff_id (FK)     |
| course_id (FK)    |
| certificate_type  | (cpr_bls, wound_care, etc.)
| achievement_title |
| issue_date        |
| expiry_date       |
| grade             |
| signature_hash    | (SHA-256)
| qr_code (image)   |
| revoked (bool)    |
| revoke_reason     |
+-------------------+
```

---

## 7. Deployment & Environment Configuration

### Backend Setup & Daphne ASGI Server

HomeCare OS requires Daphne ASGI for real-time WebSocket connection handling alongside standard HTTP:

```bash
# 1. Navigate to backend
cd backend

# 2. Activate virtual environment
venv\Scripts\activate      # Windows
# source venv/bin/activate  # Linux/macOS

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run database migrations (applies accounts, patients, staff, tracking, and lms)
python manage.py migrate

# 5. Start development servers:
# Option A: Standard HTTP dev server
python manage.py runserver 0.0.0.0:8000

# Option B: Daphne ASGI server (Enables real-time WebSockets ws://.../ws/tracking/)
daphne -b 0.0.0.0 -p 8000 homecareOS.asgi:application
```

### Frontend Setup & Dynamic API Configuration

The web dashboard dynamically configures its target backend URL:
- Reads `import.meta.env.VITE_API_URL`
- Defaults to `http://localhost:8000/api` in local development
- In production, set `VITE_API_URL` in `.env.production` (e.g., `http://179.198.198.179/api`)

```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
# Dashboard launches on http://localhost:5173
```

### Mobile App Setup (React Native / Expo)

```bash
# 1. Navigate to mobile
cd mobile

# 2. Install dependencies
npm install

# 3. Start Expo development server
npx expo start
# Scan the displayed QR code using Expo Go on iOS or Android
```

### Production Environment Variables
| Variable | Description | Example |
| :--- | :--- | :--- |
| `DEBUG` | Django debug flag | `False` |
| `SECRET_KEY` | Cryptographic secret for signing JWTs and sessions | `django-insecure-prod-key-xyz` |
| `ALLOWED_HOSTS` | Permitted hostnames | `homecareos.com,api.homecareos.com` |
| `DATABASE_URL` | PostgreSQL connection string with SSL | `postgres://user:pass@localhost:5432/homecareos?sslmode=require` |
| `FIELD_ENCRYPTION_KEY` | 32-byte Fernet key for encrypting patient PHI | `fernet-key-base64==` |
| `REDIS_URL` | Redis URL for Channels channel layer and Celery | `redis://localhost:6379/0` |
| `CORS_ALLOWED_ORIGINS` | Trusted origins for frontend requests | `https://homecareos.com,http://localhost:5173` |
| `VITE_API_URL` | Frontend API base endpoint | `https://api.homecareos.com/api` |

---

## 8. Mobile & Dashboard Cross-Platform Integration Architecture

HomeCare OS bridges field clinicians (operating on the React Native mobile app) with central clinical dispatchers and hospital managers (operating on the React Web Dashboard) through a unified Django REST Framework & Django Channels WebSocket backend.

### 8.1 System Topology & Shared Core

```
┌─────────────────────────────────────────────────────────────────┐
│                     SHARED DJANGO BACKEND                       │
│                   http://<SERVER_IP>:8000                       │
│                                                                 │
│  REST API (JWT)          WebSocket (Channels + Redis)           │
│  /api/...                ws://<SERVER_IP>:8000/ws/tracking/     │
└────────────┬──────────────────────────┬─────────────────────────┘
             │  REST + WS               │  REST + WS
             ▼                          ▼
┌────────────────────┐      ┌──────────────────────────┐
│  React Native App  │      │   React Web Dashboard    │
│  (Field Clinician: │      │  (Hospital Admin, Care   │
│   Nurse / Doctor / │      │   Manager, Coordinator)  │
│   Therapist)       │      │                          │
│                    │      │                          │
│  iOS / Android     │      │   http://<SERVER_IP>:5173│
└────────────────────┘      └──────────────────────────┘
```

- **Shared Authentication:** Both the mobile app and web dashboard authenticate against `/api/auth/login/`, obtaining identical JWT access and refresh tokens.
- **WebSocket Protocol:** Both clients connect to `ws://<host>:8000/ws/tracking/?token=<JWT>` via `JWTAuthMiddleware`.
- **Zero-Latency Dispatch:** When a field nurse sends a `location_update` or triggers an `sos` panic signal from their phone, the Django Channels broadcast immediately updates the Web Dashboard's live map and triggers emergency siren modals without any polling delay.

### 8.2 End-to-End Nurse Shift Lifecycle Flow

```
📱 NURSE PHONE (Mobile)        🗄 BACKEND (:8000)          🖥 WEB DASHBOARD
       │                               │                         │
       ├─ POST /auth/login/ ──────────►│                         │
       ├─ GET  /auth/me/   ───────────►│                         │
       ├─ GET  /bookings/today/ ──────►│                         │
       ├─ WS CONNECT (?token=JWT) ────►│◄── WS CONNECT ──────────┤
       │                               │                         │
    [En Route]                         │                         │
       ├─ WS: location_update ────────►│──── BROADCAST ─────────►│ Live Pin Moves
       ├─ POST /tracking/gps-ping/────►│ (Geofence Evaluation)   │
       │                               │                         │
    [Arrived at Home]                  │                         │
       ├─ POST /tracking/check-in/────►│ booking → in_progress   │
       │                               │──── BROADCAST ─────────►│ Status: In Progress
       │                               │                         │
    [During Visit]                     │                         │
       ├─ GET  .../mar/due-today/─────►│                         │
       ├─ POST .../mar/administer/────►│ MAR Record Committed    │
       ├─ POST .../daily-report/ ─────►│ Form A NurseNote Saved  │
       │                               │                         │
    [Departure & Check-out]            │                         │
       ├─ POST /tracking/check-out/───►│ booking → completed     │
       │◄─ { duration_minutes } ───────│ LiveVisit Cleaned Up    │
       └─ WS DISCONNECT ──────────────►│                         │
```

### 8.3 Offline Resiliency & Field Synchronization

When clinicians enter remote patient homes with zero cellular coverage:
1. All critical actions (Medication doses, Form A notes, Check-ins, Check-outs) are written to a local persistent FIFO queue via `submitWithOfflineFallback()` with unique idempotency keys (`X-Idempotency-Key`).
2. A `NetInfo` event listener detects connectivity restoration and flushes the queue sequentially.
3. If an action was already processed on the server, a `409 Conflict` is safely discarded without corrupting medical records or triggering user-facing error dialogues.

### 8.4 Battery-Conscious Mobile GPS Tracking (`homecare-location-task`)

Field clinicians are on the road for 8–12 hours shifts. Continuous GPS background polling quickly exhausts device battery if unmanaged. HomeCare OS implements strict battery discipline:
- **Permission On-Demand:** Foreground and background permissions (`Location.requestBackgroundPermissionsAsync`) are requested strictly when the clinician taps **"Start Visit"** in `VisitDetailScreen.js`, never at initial login.
- **Cadence Optimization:** Uses `expo-task-manager` task `homecare-location-task` configured for a 30-second interval (`PING_INTERVAL_MS = 30000`) and 10-meter distance filter, transmitting telemetry via `POST /api/tracking/gps-ping/` and WebSocket `location_update`.
- **Zero-Waste Termination:** When the clinician completes a visit and taps **"Check Out"**, `locationService.stopLocationTask()` immediately deregisters native background updates, stopping all GPS hardware draw instantly.

### 8.5 Real-Time Emergency SOS & Web Audio Dispatch Engine

- **Distress Initiation:** Field clinicians can tap the high-contrast red SOS button in `VisitDetailScreen.js` at any time during a visit.
- **Dual Transport:** The mobile app transmits the panic event simultaneously via REST (`POST /api/tracking/sos/`) and WebSocket (`mobileWS.sendSOSAlert(...)`).
- **Instant Dispatcher Notification:** The Web Dashboard (`LiveTracking.jsx`):
  - Synthesizes a loud, 2-tone alarm chime (800Hz / 600Hz) via the browser's Web Audio API (`window.playAlarmChime()`), requiring zero external audio assets.
  - Mounts a sticky, pulsating red banner (`.sos-banner-pulsating`) detailing attending clinician, patient, timestamp, and coordinates.
  - Enables dispatchers to log incident resolution notes directly to `POST /api/tracking/sos/{id}/resolve/`, instantly silencing the alarm across all connected dashboard tabs.

### 8.6 End-to-End System Verification (9/9 Automated Tests Verified)

The entire cross-platform tracking pipeline is validated through the automated integration test suite (`verify_tracking.py`):
1. **Far GPS Ping (> 100m):** Verifies location telemetry without false arrival check-in.
2. **Geofence Auto Check-in (≤ 100m):** Validates automatic transition to `in_progress` upon entering perimeter.
3. **Idempotent Manual Check-in:** Confirms no duplicates or exceptions when re-submitting arrival.
4. **SOS Distress Creation:** Verifies active emergency panic logging and clinician linkage.
5. **SOS Central Resolution:** Confirms incident resolution, reviewer attribution, and status clearance.
6. **Live Visits Active Snapshot:** Confirms accurate payload structure of active field staff and patient telemetry.
7. **Alert Rules Persistence:** Validates database storage of operational delay and overstay thresholds.
8. **Visit Check-Out & Duration:** Verifies arrival-to-departure duration calculation and transient telemetry cleanup.
9. **Staff Today's Schedule:** Verifies secure role-based schedule scoping for field staff.

> **Complete Implementation Reference:**  
> For complete React Native service code, Axios interceptors, offline queue implementations, and step-by-step curl test scripts, refer to [`MOBILE_INTEGRATION.md`](file:///c:/Users/Administrator/Desktop/health/MOBILE_INTEGRATION.md).

---

## 9. React Native Mobile App Architecture & Screen Catalog (`mobile/`)

The mobile application (`mobile/`) is built using React Native and Expo, tailored for field clinicians (nurses, therapists, doctors) and patient families. It connects to the Django REST Framework API and Daphne ASGI WebSockets.

### 9.1 Mobile Architecture & Directory Structure

```
mobile/
├── App.js                     # Root navigation, auth state listener, offline banner
├── app.json                   # Expo configuration, location permissions & schemes
├── assets/                    # Clinical icons, eHealth logos, splash screens
└── src/
    ├── components/            # Reusable UI component library
    │   ├── AnimatedButton.js  # Haptic-ready pressable with spring animation
    │   ├── AnimatedCheckbox.js# Micro-animated clinical checklist checkbox
    │   ├── Card.js            # Elevated container with iOS/Android shadow
    │   ├── EmptyState.js      # Zero-data illustration & action prompt
    │   ├── FadeInView.js      # Smooth opacity transition container
    │   ├── NoInternetBanner.js# Floating offline warning indicator
    │   ├── PrimaryButton.js   # High-contrast action button with loading spinner
    │   ├── PulsingDot.js      # Live GPS transmission indicator
    │   ├── SessionExpiredModal.js # Auto-prompts re-auth on JWT expiry
    │   ├── SkeletonLoader.js  # Content placeholder animation
    │   ├── StatusBadge.js     # Standardized clinical status pills
    │   └── Toast.js           # Animated notification toast overlay
    ├── screens/               # 19 Clinician workflow screens
    │   ├── AttendanceScreen.js       # Shift clock-in / clock-out with GPS pin
    │   ├── CheckoutScreen.js         # Visit completion & departure confirmation
    │   ├── DailyReportScreen.js      # Multipart Form A notes & wound photo upload
    │   ├── HomeScreen.js             # Clinician home dashboard hub
    │   ├── LeaveRequestScreen.js     # Staff leave application & balance tracker
    │   ├── LoginScreen.js            # DRF JWT login (supports username or email)
    │   ├── ManagerViewScreen.js      # Field supervisor overview & staff status
    │   ├── NotificationsScreen.js    # Operational alerts & assignment updates
    │   ├── NursesNoteScreen.js       # Form A clinical notes editor
    │   ├── OnboardingScreen.js       # First-time app walkthrough
    │   ├── PhotoViewerScreen.js      # High-res wound inspection photo viewer
    │   ├── ProfileScreen.js          # Clinician digital ID & licensing credentials
    │   ├── ResetPasswordScreen.js    # 2-step OTP password reset screen
    │   ├── SplashScreen.js           # Branded initial boot screen
    │   ├── TodayScheduleScreen.js    # Today's assigned visit itinerary
    │   ├── TodaysMedsScreen.js       # Form C 7-day MAR administration grid
    │   ├── VisitDetailScreen.js      # Active visit cockpit, map & SOS trigger
    │   ├── VitalsEntryScreen.js      # Form B vitals input with anomaly alerts
    │   ├── WelcomeScreen.js          # Platform selection & welcome banner
    │   └── family/                   # 6 Family Portal mobile screens
    │       ├── FamilyHomeScreen.js         # Patient status & upcoming nurse visits
    │       ├── FamilyInvoicesScreen.js     # Billing summaries & invoice PDFs
    │       ├── FamilyLiveTrackingScreen.js # Real-time nurse en-route map
    │       ├── FamilyMessagesScreen.js     # Direct care manager chat
    │       ├── MyVisitsScreen.js           # Chronological visit history
    │       └── VitalsTrendScreen.js        # Interactive vitals trend charts
    ├── services/              # Core networking, tracking & storage services
    │   ├── api.js             # Axios client with JWT auto-refresh & error handler
    │   ├── locationService.js # Expo TaskManager background location tracking
    │   ├── location.js        # Foreground GPS coordinates & permission helpers
    │   ├── offlineQueue.js    # AsyncStorage persistent mutation queue (FIFO)
    │   ├── tracking.js        # High-level tracking API dispatchers
    │   └── websocket.js       # Reconnecting WebSocket client for Daphne
    └── theme/                 # Standard design tokens (colors, typography, spacing)
```

### 9.2 Clinician Mobile Workflow Screens (19 Screens)

1. **`LoginScreen.js`:** Authenticates against `POST /api/auth/login/` supporting username or email. Securely stores JWT access and refresh tokens in AsyncStorage.
2. **`ResetPasswordScreen.js`:** 2-step OTP verification (`POST /api/auth/verify-otp/`) and password reset (`POST /api/auth/reset-password/`).
3. **`AttendanceScreen.js`:** Captures clinician GPS coordinates and timestamp for daily clock-in/out (`POST /api/staff/attendance/`).
4. **`TodayScheduleScreen.js`:** Lists all scheduled visits for the day fetched from `GET /api/bookings/today/`, badge-coded by status (`assigned`, `en_route`, `in_progress`, `completed`).
5. **`VisitDetailScreen.js`:** Active visit control cockpit:
   - Displays patient name, MR number, address, diagnosis, and care instructions.
   - **"Start Visit"** action: Requests background GPS permissions and initiates `homecare-location-task`.
   - **Emergency SOS Button:** High-contrast red button triggering immediate distress broadcast via WebSocket and REST.
   - Shortcuts to Vitals Entry (Form B), Medication Administration (Form C MAR), and Nurses Notes (Form A).
6. **`VitalsEntryScreen.js`:** Captures systolic, diastolic, pulse, temperature, SpO2, respiratory rate, and blood sugar (`POST /api/patients/vitals/`). Displays immediate warnings for abnormal physiological ranges.
7. **`TodaysMedsScreen.js`:** Form C MAR sheet. Displays medications due today with dosage, route, and schedule. Ticking a dose calls `POST /api/patients/{id}/mar/administer/` with duplicate dose rejection (`409 Conflict`).
8. **`NursesNoteScreen.js`:** Form A subjective/objective progress notes (`POST /api/patients/notes/`).
9. **`DailyReportScreen.js`:** Comprehensive end-of-visit submission supporting multi-photo bedside wound uploads via `multipart/form-data` (`POST /api/patients/{id}/daily-report/`).
10. **`CheckoutScreen.js`:** Final departure confirmation (`POST /api/tracking/check-out/`). Automatically calculates visit duration and terminates background location tracking.
11. **`LeaveRequestScreen.js`:** Allows staff to submit leave requests (`POST /api/staff/leave-requests/`) with date pickers and reason categories.
12. **`HomeScreen.js`:** Clinician daily overview with quick KPIs, next stop, and shift status.
13. **`ManagerViewScreen.js`:** Field supervisor view for monitoring nurse statuses and active visits.
14. **`NotificationsScreen.js`:** In-app operational alerts and assignment updates.
15. **`ProfileScreen.js`:** Clinician digital ID card, license credentials (PMDC/PNC), and branch assignment.
16. **`PhotoViewerScreen.js`:** Full-screen zoomable viewer for clinical wound photos.
17. **`OnboardingScreen.js`:** First-run onboarding carousel.
18. **`WelcomeScreen.js`:** Role entry selection.
19. **`SplashScreen.js`:** Branded launch screen with automatic JWT validity checking.

### 9.3 Family Portal Mobile Screens (6 Screens)

1. **`FamilyHomeScreen.js`:** Family overview displaying current patient status, attending nurse details, and next scheduled home visit.
2. **`FamilyLiveTrackingScreen.js`:** Live OpenStreetMap tracking showing the attending nurse moving towards the patient's home in real-time.
3. **`MyVisitsScreen.js`:** Chronological history of past visits, attending clinicians, and care summaries.
4. **`VitalsTrendScreen.js`:** Interactive trend charts showing blood pressure, heart rate, temperature, and oxygen saturation over time.
5. **`FamilyInvoicesScreen.js`:** Itemized invoice balances, payment history, and downloadable PDF receipts.
6. **`FamilyMessagesScreen.js`:** Direct two-way messaging channel with the assigned Care Manager.

### 9.4 Mobile Offline Queue & Real-Time Services

- **Axios JWT Auto-Refresh (`api.js`):** Intercepts HTTP 401 responses, calls `POST /api/auth/refresh/` using the stored refresh token, and replays the original failed request seamlessly.
- **Offline Mutation Queue (`offlineQueue.js`):** If a network error occurs during critical clinical actions (e.g. administering a medication or checking in), the payload is enqueued into AsyncStorage with a unique UUID idempotency key (`X-Idempotency-Key`). A `NetInfo` listener flushes pending requests once connectivity is re-established.
- **Background GPS Service (`locationService.js`):** Registers an `expo-task-manager` background task `homecare-location-task` that transmits coordinates every 30 seconds (`POST /api/tracking/gps-ping/`) while preserving clinician device battery.
- **WebSocket Streaming (`websocket.js`):** Auto-reconnecting WebSocket connection to `ws://<server>/ws/tracking/?token=<JWT>` for live location broadcasting and instantaneous SOS alerts.

---

## 10. Real Backend Persistence & Data Integrity Architecture

### 10.1 Zero-Mock Real Persistence Enforcement

HomeCare OS operates on **100% real database persistence across both web and mobile surfaces**:
- **Removal of Mock Fallbacks:** Hardcoded mock arrays were systematically eliminated from `useStore.js`, `Patients.jsx`, `Bookings.jsx`, `Staff.jsx`, and `FamilyPortal.jsx`.
- **Direct API Synchronization:** All CRUD operations communicate directly with the Django REST Framework endpoints. State modifications are reflected reactively in Zustand only upon verified HTTP `200/201` server responses.
- **Data Integrity:** Database migrations ensure relational integrity between `User`, `Staff`, `Patient`, `Booking`, `VitalSign`, `NurseNote`, `Invoice`, `CourseAssignment`, and `Certificate`.

### 10.2 Admin-Set Staff Provisioning & Immediate Login

- Administrators can register clinicians directly from the Web Dashboard (`Staff.jsx`).
- The registration form captures `username`, `email`, and an initial **admin-set password**.
- The backend `StaffSerializer` creates both the `Staff` profile and the underlying Django `User` object, hashing the password using `user.set_password(...)`.
- The clinician can immediately log in to the mobile app or web dashboard without requiring external email activation workflows.

### 10.3 Real-Time Scheduling & Dispatch Persistence

- Newly created patients and nurses immediately persist to the database and are dynamically loaded into scheduling assignment dropdowns and dispatch rosters.
- Booking status transitions (`pending` → `assigned` → `en_route` → `in_progress` → `completed`) trigger real-time database updates and Daphne ASGI WebSocket broadcasts, ensuring hospital dispatchers and field nurses maintain identical operational state.

---
*© 2026 HomeCare OS Enterprise. All rights reserved. Hospital at Home Management Platform.*

