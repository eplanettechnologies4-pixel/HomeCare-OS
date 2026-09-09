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
   - [Authentication Protocol (JWT)](#authentication-protocol-jwt)
   - [Permission Matrix](#permission-matrix)
3. [Frontend Page Catalog & Detailed Feature Specifications](#3-frontend-page-catalog--detailed-feature-specifications)
   - [Page 1: Public Website & 6-Step Booking Wizard](#page-1-public-website--6-step-booking-wizard)
   - [Page 2: Public Identity Verification Portal](#page-2-public-identity-verification-portal)
   - [Page 3: Authentication & Password Reset Portal](#page-3-authentication--password-reset-portal)
   - [Page 4: Family Portal (Hospital at Home for Families)](#page-4-family-portal-hospital-at-home-for-families)
   - [Page 5: Operations Overview Dashboard](#page-5-operations-overview-dashboard)
   - [Page 6: Bookings & Scheduling Management](#page-6-bookings--scheduling-management)
   - [Page 7: Live GPS Field Tracking, Geofencing & SOS Dispatch](#page-7-live-gps-field-tracking-geofencing--sos-dispatch)
   - [Page 8: Staff & Clinical Workforce Roster](#page-8-staff--clinical-workforce-roster)
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
4. [Backend API Reference (Every Endpoint & URL)](#4-backend-api-reference-every-endpoint--url)
   - [Core & Documentation URLs](#core--documentation-urls)
   - [Authentication Endpoints (`/api/auth/`)](#authentication-endpoints-apiauth)
   - [Bookings API (`/api/bookings/`)](#bookings-api-apibookings)
   - [Staff & HR API (`/api/staff/`)](#staff--hr-api-apistaff)
   - [Patients & EMR API (`/api/patients/`)](#patients--emr-api-apipatients)
   - [Tracking, Geofencing & SOS API (`/api/tracking/`)](#tracking-geofencing--sos-api-apitracking)
   - [Accounts & Financial Reports API (`/api/accounts/`)](#accounts--financial-reports-api-apiaccounts)
   - [Billing & Invoicing API (`/api/billing/`)](#billing--invoicing-api-apibilling)
   - [CRM & Lead Lifecycle API (`/api/crm/`)](#crm--lead-lifecycle-api-apicrm)
   - [Patient/Family Portal API (`/api/portal/`)](#patientfamily-portal-api-apiportal)
   - [Notifications API (`/api/notifications/`)](#notifications-api-apinotifications)
5. [Universal PDF Generation & Printing Subsystem](#5-universal-pdf-generation--printing-subsystem)
6. [Data Models & Entity-Relationship Schema](#6-data-models--entity-relationship-schema)
7. [Deployment & Environment Configuration](#7-deployment--environment-configuration)
8. [Mobile & Dashboard Cross-Platform Integration Architecture](#8-mobile--dashboard-cross-platform-integration-architecture)

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
| (Restricted View)     |     | Application (Vite)     |     | Dashboard (RBAC)       |
+-----------------------+     +-----------+------------+     +------------------------+
                                          |
                                          | REST API / JSON (Bearer JWT)
                                          v
                              +-----------+------------+
                              | Django REST Framework  |
                              | Backend (homecareOS)   |
                              +-----+-----+------+-----+
                                    |     |      |
         +--------------------------+     |      +------------------------+
         v                                v                               v
+------------------+             +-----------------+             +------------------+
| SQLite/Postgres  |             | drf-spectacular |             | ReportLab PDF    |
| Relational DB    |             | OpenAPI 3.0 Doc |             | Engine Generator |
+------------------+             +-----------------+             +------------------+
```

### Architectural Key Characteristics
- **Client Tier (`frontend/`):** React 18 SPA built with Vite. Central state managed by `zustand` (`frontend/src/store/useStore.js`) with persistent caching, optimistic UI updates, and reactive synchronization.
- **Server Tier (`backend/`):** Django 4.2 framework utilizing Django REST Framework (DRF). Modular app structure separating business domains: `accounts`, `billing`, `bookings`, `crm`, `patients`, `portal`, `reports`, `staff`, `tracking`.
- **Security:** Token-based authentication using `rest_framework_simplejwt` with short-lived access tokens and refresh rotation.
- **Documentation Engine:** `drf-spectacular` generating automated OpenAPI 3.0 schemas with an interactive Swagger UI.

---

## 2. Security, Authentication & Role-Based Access Control (RBAC)

HomeCare OS enforces strict role-based access control across navigation, page rendering, API endpoints, and field-level data visibility.

### Supported User Roles

| Role Key | Display Name | Primary Responsibilities | Default Landing Page |
| :--- | :--- | :--- | :--- |
| `super_admin` | Super Admin | Unrestricted access across all branches, permissions editing, audit trails, and user lifecycle. | Overview (`overview`) |
| `admin` | Admin | Branch operations management, staff assignments, patient admissions, and financial reporting. | Overview (`overview`) |
| `branch_manager` | Branch Manager | Local branch operations, bookings, staff attendance, and live dispatch tracking. | Overview (`overview`) |
| `care_manager` | Care Manager | Patient clinical oversight, nurse visit assignments, care plans, and family coordination. | Overview (`overview`) |
| `nurse` | Nurse / Doctor | Bedside clinical care, Form A (Nurses Notes), Form B (Vitals), Form C (MAR), daily reports. | Bookings (`bookings`) |
| `accountant` | Accountant | Invoicing, payments collection, balance reconciliation, and revenue analytics. | Overview (`overview`) |
| `crm_executive` | CRM Executive | Lead acquisition, inbound phone/web inquiries, and booking conversion pipeline. | CRM (`crm`) |
| `patient_family` | Patient / Family | Read-only access to care progress, visit schedules, invoices, vitals, and care manager chat. | Family Portal (`family-portal`) |

### Authentication Protocol (JWT)

- **Access Token Endpoint:** `POST /api/auth/login/`
  - Input: `{"username": "<email_or_phone>", "password": "<password>"}`
  - Output: `{"access": "<JWT_ACCESS_TOKEN>", "refresh": "<JWT_REFRESH_TOKEN>"}`
- **Refresh Token Endpoint:** `POST /api/auth/refresh/`
  - Input: `{"refresh": "<JWT_REFRESH_TOKEN>"}`
  - Output: `{"access": "<NEW_JWT_ACCESS_TOKEN>"}`
- **Client Storage:** Tokens stored securely in app memory with optional persistent storage when *Remember Me* is enabled.

### Permission Matrix

| Module | Super Admin | Admin | Branch Manager | Care Manager | Nurse | Accountant | CRM Exec | Patient Family |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Bookings** | `V A E D` | `V A E` | `V A E` | `V A E` | `V` | `V` | `V A` | `V` |
| **Patients (EMR)** | `V A E D` | `V A E` | `V A E` | `V A E` | `V` | `V` | - | `V` |
| **Billing & Invoices** | `V A E D` | `V A E` | `V` | - | - | `V A E` | - | `V` |
| **Staff Roster** | `V A E D` | `V A E` | `V A E` | `V` | - | - | - | - |
| **User Management** | `V A E D` | `V A E` | `V` | - | - | - | - | - |

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
    └── [18] User Management & Security (`users`) [Accounts, Permissions Matrix, Audit Trail]
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

#### 6-Step Public Booking Wizard Flow:
```
[ Step 1: Select Service ]
         |
         v
[ Step 2: Patient & Contact Details ]
         |
         v
[ Step 3: Address & Precise Map Pin ]
         |
         v
[ Step 4: Prescription & Clinical Notes ]
         |
         v
[ Step 5: Preferred Date, Time Slot & Payment Method ]
         |
         v
[ Step 6: Confirmation, Booking Code & Family Portal Invitation ]
```
- **Store Hook:** `submitPublicBooking(formData)` atomically:
  - Generates a new `MR-YYYY-XXX` medical record.
  - Registers the patient record.
  - Creates a booking entry in `pending` status.
  - Registers a lead in the CRM pipeline for follow-up verification.

---

### Page 2: Public Identity Verification Portal
- **Component:** `frontend/src/pages/PublicVerification.jsx`
- **Internal Route ID:** `public-verification`
- **Access Level:** Public (accessible via QR code printed on the clinician's Physical ID card or SMS link)
- **Parameters:** `empId` (Staff Employee ID)
- **Key Features:**
  - **Live Verification Status Banner:** Queries the database in real-time. If the staff member's system user account is suspended or terminated, displays a high-visibility red warning: `"NOT CURRENTLY ACTIVE / ACCOUNT SUSPENDED — Do not admit to home"`.
  - If active, displays a verified green badge: `"OFFICIALLY VERIFIED & ACTIVE STAFF"`.
  - Clinician photo, full legal name, role designation, and license certification (PMDC / PNC verified).
  - **Live Visit Status:** Indicates whether the nurse is currently dispatched to an active booking.
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
- **Role Customization:**
  - **For Nurses:** Shows "My Visits Today", next scheduled stop countdown, personal review rating, field overtime hours, scheduled visit route table, and personal Digital Staff ID Card.
  - **For Care Managers:** Shows Active Visits, Unassigned Bookings queue, Critical Clinical Alerts, and real-time mini GPS tracking map.
  - **For Admins & Super Admins:** Shows comprehensive KPI cards (Active visits, bookings, revenue, operational alerts), 28-day financial trend graphs, and field geofence status.
  - **For Accountants:** Replaces medical KPIs with Invoices Due, Daily Cash Collections, and Outstanding Balances.
  - **For CRM Executives:** Shows Inbound Leads Pipeline metrics, conversion ratios, and new inquiry queues.

---

### Page 6: Bookings & Scheduling Management
- **Component:** `frontend/src/pages/Bookings.jsx`
- **Internal Route ID:** `bookings`
- **Access Level:** `super_admin`, `admin`, `branch_manager`, `care_manager`, `nurse`, `crm_executive`
- **Key Features:**
  - Comprehensive data table displaying Booking ID, Patient Name, Service Type, Status Badge, Attending Clinician, Scheduled Time, Amount, and Payment Status.
  - Status filters: `pending`, `assigned`, `en_route`, `in_progress`, `completed`, `cancelled`, `late`, `no_show`.
  - Service filters: `short_service`, `medicine_delivery`, `long_term`, `long_term_admission`.
  - **Slide-out Booking Drawer:**
    - Patient EMR profile summary with diagnosis.
    - Embedded OpenStreetMap iframe showing exact home destination pin.
    - Actual start, end, and duration tracking.
    - Integrated `NurseAssignPanel` allowing rapid assignment and reassignment of available field staff.
  - **New Booking Modal:** Quick modal for creating on-demand and scheduled home visits.

---

### Page 7: Live GPS Field Tracking, Geofencing & SOS Dispatch
- **Component:** `frontend/src/pages/LiveTracking.jsx`
- **Internal Route ID:** `live-tracking`
- **Access Level:** `super_admin`, `admin`, `branch_manager`, `care_manager`
- **Key Features:**
  - **Dual View Modes:** Full-screen interactive map (`MiniMap.jsx` using Leaflet/OSM) vs dense real-time list.
  - **4-Stage Status Pipeline:** `Assigned` -> `En Route` -> `In Progress` -> `Completed`.
  - **Live Countdown Timer:** Calculates real-time ETA for en-route clinicians; turns urgent red when arrival is overdue.
  - **Configurable Alert Rules Panel:** Modal to configure operational thresholds:
    - Late Arrival Threshold (default: 15 min).
    - No-Show Threshold (default: 30 min).
    - Visit Overstay Threshold (default: 120 min).
  - **SOS Emergency Incident System:**
    - High-visibility pulsating red alert badge when active.
    - Displays exact coordinates, attending staff, patient name, and time of panic button trigger.
    - One-click incident resolution action with reviewer logging.
  - **Geofence Audit Log:** Automatic logging of `check_in` and `check_out` timestamps upon crossing patient geofence perimeter (100m radius).

---

### Page 8: Staff & Clinical Workforce Roster
- **Component:** `frontend/src/pages/Staff.jsx`
- **Internal Route ID:** `staff`
- **Access Level:** `super_admin`, `admin`, `branch_manager`, `care_manager`
- **Key Features:**
  - **5 Functional Sub-Tabs:**
    1. `directory`: Searchable staff cards with avatar, specialization, employee ID, contact details, rating stars, and status badges (`available`, `on_visit`, `off_duty`, `on_leave`).
    2. `daily-log`: Derived real-time attendance sheet calculating first check-in, last check-out, visit count, field hours, and overtime hours.
    3. `calendar`: Monthly grid showing clinical roster shifts (`Morning 08:00 - 16:00`, `Evening 16:00 - 00:00`, `Night 00:00 - 08:00`).
    4. `leave`: Leave requests review pipeline (`sick`, `annual`, `casual`, `unpaid`) with one-click Approve / Reject actions.
    5. `payroll`: Attendance threshold configuration and monthly hours reconciliation.
  - **Interactive Staff Drawer & Digital ID Card (`StaffIdCard.jsx`):**
    - Front face: Organization branding, photo, employee ID, PMDC/PNC QR code, emergency blood group, signature.
    - Back face: Operating rules, central dispatch contact number, and verification URL.
    - One-click physical print button.

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
- **Access Level:** `super_admin`, `admin`, `accountant`
- **Key Features:**
  - Executive Financial KPIs: Total Billed, Total Collected, and Outstanding Balances.
  - **Revenue by Service Line Donut Chart:** Visual breakdown across Nursing Care, Physiotherapy, Doctor Consultations, Elderly Attendant, and Pharmacy Consumables.
  - **30-Day Daily Revenue Bar Chart:** Daily revenue trends with tooltip inspection.
  - Detailed financial ledger table with CSV export capability.

---

### Page 14: Billing & Invoicing
- **Component:** `frontend/src/pages/Billing.jsx`
- **Internal Route ID:** `billing`
- **Access Level:** `super_admin`, `admin`, `accountant`
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
- **Access Level:** `super_admin`, `admin`, `branch_manager`
- **Sub-Tabs:**
  1. `users`: System user accounts table showing full name, email, phone, role badge, branch assignment, active/suspended status, and last login.
     - Add User Modal: Creates accounts and issues auto-generated secure temporary passwords.
     - Account Actions: Suspend / Activate account, Reset Password, and Delete (Super Admin only).
  2. `permissions`: Interactive **Role Permission Matrix** allowing Super Admins to toggle View (`V`), Add (`A`), Edit (`E`), and Delete (`D`) permissions across Bookings, Patients, Billing, Staff, and User Management.
  3. `audit`: **Immutable Security Audit Trail** recording actor name, action performed (e.g., *Created Account*, *Suspended Account*, *Updated Permissions*), target account, and timestamp.

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
│   └── POST           /api/tracking/check-out/
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
  ]
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

#### 3. `GET /api/tracking/sos/active/`
- **Description:** Returns currently unresolved emergency panic alerts requiring central dispatch intervention.

#### 4. `POST /api/tracking/sos/{id}/resolve/`
- **Description:** Resolves an active SOS distress incident.
- **Request Body:**
  ```json
  {
    "notes": "Spoke with Nurse Sarah via phone. False alarm triggered by mobile pocket press. Situation normal."
  }
  ```

#### 5. `GET /api/tracking/alert-rules/` & `POST /api/tracking/alert-rules/`
- **Description:** Read and update operational delay and overstay alert threshold rules.

#### 6. `GET /api/tracking/live-visits/`
- **Description:** Real-time location stream of all active field staff with current latitude, longitude, heading, and battery level.

#### 7. `POST /api/tracking/gps-ping/`
- **Description:** Background location update endpoint called by the mobile app every 30 seconds while the clinician is on duty. Automatically performs geofence calculations against the target booking address.
- **Request Body:** `{"booking_id": 12, "lat": 24.8607, "lng": 67.0104}`
- **Side Effect:** Broadcasts position to the Web Dashboard map via WebSocket and triggers automatic check-in if within geofence radius.

#### 8. `POST /api/tracking/check-in/`
- **Description:** Clinician arrival check-in at the patient's home. Transitions booking status to `in_progress`.
- **Request Body:** `{"booking_id": 12, "lat": 24.8607, "lng": 67.0104, "method": "manual"}`
- **Response (200 OK):** `{"status": "checked_in", "timestamp": "2026-09-07T14:02:00Z"}`

#### 9. `POST /api/tracking/check-out/`
- **Description:** Clinician departure and visit completion. Transitions booking status to `completed` and calculates exact visit duration.
- **Request Body:** `{"booking_id": 12, "lat": 24.8607, "lng": 67.0104}`
- **Response (200 OK):** `{"status": "checked_out", "visit_duration_minutes": 58}`

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

---

## 6. Data Models & Entity-Relationship Schema

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

---

## 7. Deployment & Environment Configuration

### Backend Setup
```bash
# 1. Navigate to backend
cd backend

# 2. Activate virtual environment
# Windows:
venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run database migrations
python manage.py migrate

# 5. Start development server
python manage.py runserver 0.0.0.0:8000
```

### Frontend Setup
```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

### Production Environment Variables
| Variable | Description | Example |
| :--- | :--- | :--- |
| `DEBUG` | Django debug flag | `False` |
| `SECRET_KEY` | Cryptographic secret for signing JWTs and sessions | `django-insecure-prod-key-xyz` |
| `ALLOWED_HOSTS` | Permitted hostnames | `homecareos.com,api.homecareos.com` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/homecareos` |
| `CORS_ALLOWED_ORIGINS` | Trusted origins for frontend requests | `https://homecareos.com` |

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
1. All critical actions (Medication doses, Form A notes, Check-ins) are written to a local persistent SQLite/AsyncStorage FIFO queue with unique idempotency keys (`X-Idempotency-Key`).
2. A `NetInfo` event listener detects connectivity restoration and flushes the queue sequentially.
3. If an action was already processed on the server, a `409 Conflict` is safely discarded without corrupting medical records.

> **Complete Implementation Reference:**  
> For complete React Native service code, Axios interceptors, offline queue implementations, and step-by-step curl test scripts, refer to [`MOBILE_INTEGRATION.md`](file:///c:/Users/Administrator/Desktop/health/MOBILE_INTEGRATION.md).

---
*© 2026 HomeCare OS Enterprise. All rights reserved. Hospital at Home Management Platform.*

