<h1 align="center">
  <br>
  🏥 HomeCare OS
  <br>
</h1>

<h4 align="center">Enterprise Hospital-at-Home Management Platform</h4>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0%20Enterprise-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/Django-4.2+-green?style=for-the-badge&logo=django" alt="Django">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react" alt="React">
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/license-MIT-yellow?style=for-the-badge" alt="License">
</p>

<p align="center">
  <a href="#-overview">Overview</a> •
  <a href="#-features">Features</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-docker-deployment">Docker Deployment</a> •
  <a href="#-api-reference">API Reference</a> •
  <a href="#-security">Security</a>
</p>

---

## 📋 Overview

**HomeCare OS** is a full-stack, enterprise-grade healthcare management system purpose-built for **Hospital at Home**, **Skilled Home Nursing**, **Palliative Care**, and **Home Rehabilitation Services**.

It connects three layers in real-time:

| Layer | Who | Technology |
|:---|:---|:---|
| 🖥️ **Web Dashboard** | Admins, Care Managers, Accountants, CRM | React 18 + Vite SPA |
| 📱 **Mobile App** | Field Nurses, Doctors, Therapists | React Native (iOS/Android) |
| ⚙️ **Backend API** | Shared infrastructure | Django REST Framework + WebSockets |

The system manages the complete care lifecycle — from a patient's first public booking enquiry through clinical visit dispatch, live GPS tracking, medication administration records (MAR), billing, and automated encrypted nightly database backups.

---

## ✨ Features

### 🌐 Public-Facing
- **6-Step Online Booking Wizard** — Patient self-registers, selects service, pins home address on map, attaches prescriptions, picks time slot, receives confirmation code and Family Portal invite
- **Staff Identity Verification Portal** — Public QR/SMS page showing real-time licence status, PMDC/PNC verification, and live dispatch status of any field clinician

### 🔐 Authentication & Access Control
- **JWT Authentication** — Short-lived access tokens (8 hours) with 7-day rotating refresh tokens
- **8 Distinct User Roles** — `super_admin`, `admin`, `branch_manager`, `care_manager`, `nurse`, `accountant`, `crm_executive`, `patient_family`
- **Granular RBAC** — Per-module View / Add / Edit / Delete permissions, configurable at runtime by Super Admins
- **OTP Password Reset** — 6-digit code to registered email/phone
- **Account Suspension Detection** — Blocked users receive explicit suspension messages on login attempt

### 🏠 Family Portal
Dedicated interface for patient families with 7 sub-tabs: visit schedule, clinical notes (Form A), vitals charts (Form B), reports, invoices, and direct chat with the Care Manager.

### 📊 Operations Dashboard (18 Pages)
Role-aware dashboard that adapts its KPIs, charts, and actions per the logged-in user's role:

| # | Page | Route | Key Capability |
|:---|:---|:---|:---|
| 1 | Public Website | `public-website` | Marketing site + 6-step booking wizard |
| 2 | Identity Verification | `public-verification` | Real-time staff licence check via QR |
| 3 | Login / OTP Reset | `login` | JWT login, OTP password reset, demo switcher |
| 4 | Family Portal | `family-portal` | 7-tab read-only patient/family view |
| 5 | Overview Dashboard | `overview` | Role-customized KPIs, charts, live map |
| 6 | Bookings & Scheduling | `bookings` | Status pipeline, nurse assignment, booking drawer |
| 7 | Live GPS Tracking | `live-tracking` | Real-time map, SOS dispatch, geofence audit log |
| 8 | Staff & Workforce | `staff` | Directory, daily log, calendar, leave, payroll |
| 9 | Patient Directory | `patients` | Full EMR directory, instant search, add/edit |
| 10 | Patient 360° Dossier | `patient-360` | 10 tabs: Forms A, B, C, labs, care plan, invoices |
| 11 | Therapy Services | `therapy` | Physio, Speech, Psychotherapy, Dietetics sessions |
| 12 | Admin & HR Hub | `admin-hr` | Announcements, SOPs, training, payroll, CMS |
| 13 | Financial Accounts | `accounts` | Revenue KPIs, service-line donut chart, ledger |
| 14 | Billing & Invoicing | `billing` | Invoice generation, payment recording, PDF export |
| 15 | CRM Leads Pipeline | `crm` | Kanban drag-and-drop, lead-to-patient conversion |
| 16 | Operational Reports | `reports` | Attendance, compliance, revenue, census CSV/PDF |
| 17 | Executive Analytics | `analytics` | Recharts revenue trends, date-range comparison |
| 18 | User Management | `users` | User accounts, live permission matrix, audit trail |

### 🗺️ Live GPS & Field Operations
- Real-time WebSocket location streaming (30-second pings from mobile)
- Automatic **geofence check-in/out** at 100 m patient home radius
- **SOS Panic Button** — pulsating alert, exact coordinates, one-click resolution
- Configurable alert thresholds: late arrival (15 min), no-show (30 min), overstay (120 min)

### 🧬 Clinical Tools
- **Form A — Nurse Notes**: Subjective/objective clinical progress notes
- **Form B — Vitals**: BP, HR, Temp, SpO2, RR, BSR, Weight, I&O, Insulin + AI anomaly alerts for hypertensive crisis, hypoxia, fever, hypoglycaemia
- **Form C — MAR Sheet**: 7-day medication administration grid, PRN logs, idempotent dose-tick (`409 Conflict` on duplicate)

### 📄 PDF Generation
- **Client-side print engine** (`UniversalPrintButton.jsx`) — `@media print` CSS injection, hides UI chrome, produces branded letterhead-ready documents
- **Server-side ReportLab engine** — Patient profiles, nurse visit reports, tax invoices, payroll summaries, analytics reports

---

## 🛠️ Tech Stack

### Backend
| Package | Version | Purpose |
|:---|:---|:---|
| Django | 4.2.16 | Core web framework |
| Django REST Framework | 3.15.2 | REST API layer |
| djangorestframework-simplejwt | 5.3.1 | JWT authentication |
| django-channels | 4.1.0 | WebSocket real-time layer |
| channels-redis | 4.2.0 | Redis channel layer backend |
| Celery | 5.4.0 | Async task queue |
| psycopg2-binary | 2.9.9 | PostgreSQL driver |
| dj-database-url | 2.2.0 | `DATABASE_URL` parsing with SSL |
| django-cryptography | 1.1 | Field-level Fernet encryption |
| drf-spectacular | 0.27.2 | OpenAPI 3.0 / Swagger docs |
| django-filter | 24.3 | Query filtering |
| django-cors-headers | 4.4.0 | CORS policy |
| Pillow | 10.4.0 | Image processing |
| Gunicorn | 22.0.0 | Production WSGI server |

### Frontend
| Package | Purpose |
|:---|:---|
| React 18 | UI framework |
| Vite | Build tooling & dev server |
| Zustand | Global state management |
| Recharts | Revenue & analytics charts |
| Leaflet / OpenStreetMap | GPS tracking maps |
| Lucide React | Icon system |

### Infrastructure
| Tool | Purpose |
|:---|:---|
| Docker Compose | Container orchestration |
| PostgreSQL 16 | Production database |
| Redis 7 | Celery broker + Channels layer |
| GPG (AES-256) | Backup encryption |
| OpenSSL (RSA-4096) | Postgres SSL certificates |

---

## 📁 Project Structure

```
health/
├── backend/                    # Django REST Framework API
│   ├── homecareOS/             # Project settings, URLs, ASGI/WSGI
│   ├── accounts/               # Financial accounts & payments
│   ├── billing/                # Invoice generation & payment recording
│   ├── bookings/               # Visit scheduling & status pipeline
│   ├── crm/                    # Lead pipeline & conversion
│   ├── notifications/          # In-app alerts & unread badge
│   ├── patients/               # EMR, vitals, MAR, daily reports
│   ├── portal/                 # Family-facing read-only portal API
│   ├── reports/                # PDF generation (ReportLab)
│   ├── staff/                  # Workforce, attendance, leave
│   ├── tracking/               # GPS pings, geofence, SOS
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # React 18 + Vite SPA
│   ├── src/
│   │   ├── pages/              # 18 route pages
│   │   ├── components/         # Shared UI components
│   │   ├── store/              # Zustand global state
│   │   └── hooks/              # GPS & WebSocket hooks
│   └── vite.config.js
├── postgres/
│   ├── postgresql.conf         # ssl=on, logging, performance tuning
│   └── pg_hba.conf             # hostssl required, plain TCP rejected
├── ssl/
│   └── generate-certs.sh       # One-time self-signed cert generation
├── scripts/
│   ├── backup_db.sh            # GPG-encrypted nightly backup
│   └── install-cron.sh         # Register nightly backup cron job
├── docker-compose.yml          # Full production stack
├── .env.example                # Safe placeholder template (committed)
└── .gitignore                  # Excludes .env, ssl/*.key, backups/
```

---

## ⚡ Quick Start

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16 (or Docker)
- Redis (or Docker)

### 1. Clone & configure

```bash
git clone https://github.com/your-org/homecare-os.git
cd homecare-os

# Create your secrets file
cp .env.example .env
chmod 600 .env
```

Generate required secret values and paste them into `.env`:

```bash
# Django SECRET_KEY
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Fernet field encryption key
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 2. Backend setup

```bash
cd backend

# Create & activate virtual environment
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run migrations (includes Patient field encryption migration)
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start development server
python manage.py runserver 0.0.0.0:8000
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

| URL | Description |
|:---|:---|
| `http://localhost:5173` | React web dashboard |
| `http://localhost:8000/api/docs/` | Swagger UI |
| `http://localhost:8000/django-admin/` | Django admin |

---

## 🐳 Docker Deployment

### One-time VPS setup

```bash
# 1. Configure secrets
cp .env.example .env && chmod 600 .env && nano .env

# 2. Generate Postgres SSL certificates
chmod +x ssl/generate-certs.sh && ./ssl/generate-certs.sh

# 3. Create backup directory
mkdir -p /var/backups/homecareos
```

### Start the stack

```bash
docker compose up -d
docker compose exec web python manage.py migrate
```

| Service | Image | Port Exposed |
|:---|:---|:---|
| `db` | postgres:16-alpine | ❌ Internal only (5432 never published) |
| `redis` | redis:7-alpine | ❌ Internal only |
| `web` | Built from `backend/` | ✅ 8000 (fronted by Nginx/Caddy) |
| `celery` | Same image | ❌ Internal |
| `celery-beat` | Same image | ❌ Internal |

### Install nightly encrypted backup cron

```bash
chmod +x scripts/install-cron.sh
sudo bash scripts/install-cron.sh /opt/homecareos
# Registers: daily at 02:00 → pg_dump → GPG AES-256 → /var/backups/homecareos/
```

---

## 🌐 API Reference

**Base URL:** `http://your-server:8000`  
**Auth:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`  
**Docs:** `GET /api/docs/`

### Endpoint Groups

| Prefix | Resource |
|:---|:---|
| `POST /api/auth/login/` | Get JWT access + refresh tokens |
| `POST /api/auth/refresh/` | Rotate access token |
| `GET  /api/auth/me/` | Current user profile & permissions |
| `POST /api/auth/forgot-password/` | Send OTP to email/phone |
| `GET/POST /api/bookings/` | List & create visit bookings |
| `POST /api/bookings/{id}/assign_staff/` | Assign nurse to booking |
| `GET  /api/bookings/stats/` | KPI aggregates for dashboard |
| `GET/POST /api/staff/members/` | Workforce roster |
| `POST /api/staff/leave-requests/{id}/approve/` | Approve leave |
| `GET/POST /api/patients/` | Patient EMR directory |
| `POST /api/patients/{id}/daily-report/` | Mobile nurse daily report (multipart) |
| `GET  /api/patients/{id}/mar/due-today/` | Today's scheduled medications |
| `POST /api/patients/{id}/mar/administer/` | Confirm dose administration |
| `POST /api/tracking/gps-ping/` | Mobile location update (30s interval) |
| `POST /api/tracking/check-in/` | Arrive at patient home |
| `POST /api/tracking/check-out/` | Complete visit |
| `GET  /api/tracking/sos/active/` | Active SOS emergencies |
| `POST /api/billing/invoices/{id}/record_payment/` | Record cash/card payment |
| `POST /api/crm/leads/{id}/update_stage/` | Move lead in Kanban pipeline |
| `GET  /api/notifications/unread-count/` | Badge count for notification bell |

---

## 🔒 Security

### Secrets Management
All secrets live **exclusively in `.env`** — never hardcoded, never committed to git.

| Secret | Notes |
|:---|:---|
| `SECRET_KEY` | No default — server won't start without it |
| `FIELD_ENCRYPTION_KEY` | No default — Fernet key for Patient PHI |
| `DATABASE_URL` | Includes `?sslmode=require` |
| `POSTGRES_PASSWORD` | Strong random password |
| `GPG_PASSPHRASE` | For backup encryption |

### Postgres SSL
- RSA-4096 self-signed certificate mounted read-only into the `db` container
- `postgresql.conf`: `ssl = on`
- `pg_hba.conf`: `hostssl` required; plain TCP explicitly rejected with `host … reject`
- Django: `ssl_require=True` in `dj_database_url.config()`

### Port Isolation
The `db` service has **no `ports:` entry** — port 5432 is unreachable from the host or internet.  
Only the `web` container inside `homecare_net` bridge can connect to Postgres.

### Patient PHI — Field-level Encryption

| Field | Encrypted |
|:---|:---:|
| `phone` | ✅ |
| `emergency_contact_phone` | ✅ |
| `address` | ✅ |
| `primary_diagnosis` | ✅ |
| `secondary_diagnoses` | ✅ |
| `allergies` | ✅ |
| `blood_type` | ✅ |
| `mr_number`, `first_name`, `last_name` | ❌ (query keys) |

Encryption is transparent — application code reads/writes plain strings. Fernet tokens (ciphertext) are stored in the DB column.

> ⚠️ **Key Loss = Data Loss.** Back up `FIELD_ENCRYPTION_KEY` offline in a password manager or vault. There is no recovery mechanism.

### Encrypted Nightly Backups
```
pg_dump → /dev/shm (RAM, never on disk)
        → gpg --symmetric --cipher-algo AES256 → .sql.gpg
        → shred -u plaintext
        → keep last 7, delete older
```

**Restore:**
```bash
gpg --decrypt --batch --passphrase "$GPG_PASSPHRASE" \
    homecare_2026-09-09_02-00.sql.gpg | psql homecare
```

---

## 📱 Mobile Integration

Field clinicians (React Native) and the web dashboard share one Django backend. Real-time coordination happens over Django Channels WebSockets:

```
📱 Nurse Phone               ⚙️ Backend               🖥️ Web Dashboard
     │                           │                           │
     ├─ WS: location_update ────►│──── BROADCAST ───────────►│ Live pin moves
     ├─ POST /tracking/check-in/ ►│  booking → in_progress    │
     ├─ POST .../mar/administer/ ►│  MAR record committed     │
     ├─ POST .../daily-report/  ►│  Form A NurseNote saved   │
     └─ POST /tracking/check-out/►│  booking → completed      │
```

**Offline resiliency:** Actions queue in local AsyncStorage with idempotency keys; flushed sequentially on reconnection; `409 Conflict` safely discarded.

See [`MOBILE_INTEGRATION.md`](./MOBILE_INTEGRATION.md) for full React Native service code and curl test scripts.

---

## ⚙️ Environment Variables

| Variable | Required | Example |
|:---|:---:|:---|
| `SECRET_KEY` | ✅ | `<output of get_random_secret_key()>` |
| `DEBUG` | ✅ | `False` |
| `ALLOWED_HOSTS` | ✅ | `yourdomain.com,api.yourdomain.com` |
| `DATABASE_URL` | ✅ | `postgresql://homecare:pass@db:5432/homecare?sslmode=require` |
| `POSTGRES_PASSWORD` | ✅ | Strong random password |
| `FIELD_ENCRYPTION_KEY` | ✅ | `<output of Fernet.generate_key()>` |
| `REDIS_URL` | ✅ | `redis://redis:6379/0` |
| `CORS_ALLOWED_ORIGINS` | ✅ | `https://yourdomain.com` |
| `GPG_PASSPHRASE` | ✅ | Strong passphrase for backup encryption |
| `BACKUP_DIR` | ✅ | `/var/backups/homecareos` |

See [`.env.example`](./.env.example) for the full annotated template.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. **Never commit `.env`, `ssl/*.key`, or `backups/`** — all in `.gitignore`
4. Ensure `python manage.py migrate --check` passes before opening a PR
5. Submit a pull request with a clear description of your changes

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <i>© 2026 HomeCare OS Enterprise. All rights reserved.</i><br>
  <i>Hospital at Home Management Platform — Built for Clinical Excellence.</i>
</p>
