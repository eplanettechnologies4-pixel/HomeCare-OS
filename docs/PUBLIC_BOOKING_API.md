# Public Booking API Handoff Documentation

This document provides complete instructions for external website developers and systems integrating with the **eHealth Hospital at Home** public booking endpoint.

---

## 1. Overview & Endpoint URL

The public booking endpoint allows prospective patients or their family members to submit home health care booking requests directly from the public website.

- **Production Endpoint URL:** `https://portal.ehealthpk.com/api/bookings/public/`
- **Alternative URL Alias:** `https://portal.ehealthpk.com/api/bookings/public-booking/`
- **HTTP Method:** `POST`
- **Authentication:** Unauthenticated (Public), secured with source-specific shared API keys, file signature validation, and Redis-backed IP rate throttling.

> **Important Note on Patient Accounts:**
> The public website should **NOT** prompt for or display portal login credentials. When a public booking is submitted, the patient record is registered into the system and reviewed by hospital intake staff. Hospital administrators assign a care manager and generate Family Portal login credentials, which are shared securely with the patient or family via WhatsApp or SMS.

---

## 2. API Keys & Authentication (Dual-Source Security)

To prevent spoofing or unauthorized submissions, both client sources are authenticated via source-specific environment variables:

| Client Source (`source`) | Environment Variable Name | Header Name | Behavior |
|---|---|---|---|
| `public_website` | `PUBLIC_BOOKING_API_KEY` | `X-Public-Key` | Required if env var is set. 403 on mismatch. |
| `public_mobile_app` | `MOBILE_PUBLIC_API_KEY` | `X-Public-Key` | Required if env var is set. 403 on mismatch. |

- If an environment variable is left blank or unset on the server, the key check for that specific source is skipped (useful for local development).
- If the environment variable is configured and the client provides a missing or incorrect key, the request is rejected immediately with **HTTP 403 Forbidden**.

### ⚠️ CRITICAL: Server-Side Forwarding Requirement (Never Use Browser JS)
> **WARNING: NEVER embed `PUBLIC_BOOKING_API_KEY` in client-side browser JavaScript or HTML.**
> Embedding this secret key in browser code will expose it to anyone inspecting developer network tools or page source.
>
> **Required Pattern:**
> 1. The public website frontend form submits data to the website's own backend server (e.g. Next.js Route Handler, Express.js server, PHP / Laravel backend, or WordPress plugin handler).
> 2. The website's server securely attaches `X-Public-Key: <PUBLIC_BOOKING_API_KEY>` from its private environment.
> 3. The website's server forwards the request over HTTPS to `https://portal.ehealthpk.com/api/bookings/public/`.

---

## 3. CORS Configuration on VPS

- The default `CORS_ALLOWED_ORIGINS` settings are preserved for administrative, staff, and portal applications.
- **For VPS Administrators:** If the website developers make requests that require cross-origin browser access, the public website domain (e.g. `https://ehealthpk.com` or `https://www.ehealthpk.com`) must be **APPENDED** to the existing comma-separated `CORS_ALLOWED_ORIGINS` in the root `.env` file on the VPS.
- **Example `.env` update:**
  ```env
  CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://portal.ehealthpk.com,https://ehealthpk.com,https://www.ehealthpk.com
  ```
  *(Always append to the existing origins; do NOT overwrite or remove the local/portal origins).*
  *Note: When following the recommended server-to-server pattern described in Section 2, browser CORS headers are not required.*

---

## 4. Rate Throttling & Infrastructure (Nginx + Redis)

- **Behind Nginx Proxy:** The backend is configured with `REST_FRAMEWORK['NUM_PROXIES'] = 1` so that rate limiting correctly identifies the client's real public IP from `X-Forwarded-For` rather than Nginx's internal container address.
- **Shared Redis Cache:** Rate limit states are stored in Redis (`CACHES` configured via `REDIS_URL`), ensuring throttle counts are strictly synchronized across all Gunicorn web workers.
- **Throttle Limit:** Defaults to **10 requests per hour per IP**.
- **Configurable Rate:** Hospital administrators can adjust this rate via the `PUBLIC_BOOKING_THROTTLE_RATE` environment variable (e.g. `20/hour` or `100/day`).
- When an IP exceeds the limit, the server returns **HTTP 429 Too Many Requests** with the remaining retry duration.

---

## 5. File Upload Content & Signature Validation

Uploaded prescriptions (`prescription_file` or `prescription_attachment`) are strictly validated:
1. **Size Limit:** Maximum **5 MB** (5 * 1024 * 1024 bytes).
2. **File Extension:** Must end with `.jpg`, `.jpeg`, `.png`, `.webp`, or `.pdf`.
3. **Magic Byte Signature Inspection:** In addition to file extensions and MIME headers, the backend verifies the binary magic bytes of the file content:
   - **JPEG:** Starts with `\xff\xd8\xff`
   - **PNG:** Starts with `\x89PNG\r\n\x1a\n`
   - **PDF:** Starts with `%PDF-`
   - **WEBP:** Starts with `RIFF....WEBP`
4. If a file has an incorrect signature (e.g., an executable, shell script, or HTML renamed to `.pdf`), the request is rejected with **HTTP 400 Bad Request**.

---

## 6. Request Fields Reference Table

| Field Name | Type | Required? | Default / Allowed Values | Description |
|---|---|---|---|---|
| `source` | String | **Recommended** | `public_website` or `public_mobile_app` (Default: `public_mobile_app`) | Set to `public_website` for website bookings. |
| `patient_name` or `name` | String | Optional | e.g., `"Muhammad Ali"` | Full patient name. Automatically split into first and last name if provided. |
| `first_name` | String | Optional | e.g., `"Muhammad"` | Patient's first name. |
| `last_name` | String | Optional | e.g., `"Ali"` | Patient's last name. |
| `phone` or `patient_phone` | String | **Required** | e.g., `"+923001234567"` | Primary contact telephone or mobile number. |
| `email` | String | Optional | e.g., `"family@example.com"` | Contact email for notifications and invoices. |
| `gender` | String | Optional | `'M'`, `'F'`, `'O'` (Default: `'M'`) | Patient gender (Male, Female, or Other). |
| `date_of_birth` or `patient_dob` | String | Optional | Format: `YYYY-MM-DD` | Patient date of birth. Used to calculate exact age. |
| `patient_age` or `age` | Integer | Optional | Default: `60` | Patient age if DOB is not known. |
| `address` | String | Optional | Default: `"Islamabad, Pakistan"` | Complete physical home address for home care visits. |
| `latitude` | Float | Optional | Default: `33.5700` | GPS latitude coordinate for nurse dispatch. |
| `longitude` | Float | Optional | Default: `73.1500` | GPS longitude coordinate for nurse dispatch. |
| `service_type` or `service_id` | String | Optional | `short_service`, `general_nursing`, `critical_care`, `physiotherapy`, `doctor_visit`, `lab_test`, `medical_equipment` (Default: `short_service`) | Service requested by the client. |
| `shift_duration` | String | Optional | `short_visit`, `2_hours`, `4_hours`, `6_hours`, `8_hours`, `12_hours`, `24_hours` (Default: `4_hours`) | Duration of the caregiver shift. |
| `shift_frequency` | String | Optional | `once`, `daily`, `weekly`, `biweekly`, `monthly` (Default: `once`) | Frequency of visits. |
| `scheduled_time` | String | Optional | ISO 8601 string: `YYYY-MM-DDTHH:MM:SSZ` | Desired start date and time. |
| `preferred_date` | String | Optional | Format: `YYYY-MM-DD` | Date if ISO string is not used. |
| `preferred_slot` | String | Optional | `morning` (09:00) or `evening` (15:00) | Time slot preference. |
| `payment_method` | String | Optional | `cash_on_delivery`, `bank_transfer`, `online_payment`, `credit_card` (Default: `cash_on_delivery`) | Preferred billing method. |
| `amount` | Float | Optional | Default: `2500.0` | Quoted base amount in PKR. |
| `emergency_contact_name` | String | Optional | Default: `"Family"` | Name of emergency contact. |
| `emergency_contact_phone`| String | Optional | Default: Same as patient phone | Phone of emergency contact. |
| `emergency_contact_relation` | String | Optional | Default: `"Emergency Contact"` | Relation (e.g., Son, Daughter, Spouse). |
| `diagnosis` or `primary_diagnosis` | String | Optional | Default: `"General Home Health Care"` | Primary medical condition / reason for care. |
| `allergies` | String | Optional | Default: `"NKDA"` (No Known Drug Allergies) | Known allergies. |
| `has_prescription` | Boolean / String | Optional | `true` or `false` | Indicates whether a doctor prescription exists. |
| `consult_doctor_needed` | Boolean / String | Optional | `true` or `false` | Indicates if an on-call physician consult is required. |
| `gender_preference` | String | Optional | `any`, `male`, `female` (Default: `any`) | Staff gender preference. |
| `consultant_name` | String | Optional | e.g., `"Dr. Tariq Khan"` | Referring physician or specialist. |
| `notes` | String | Optional | Free text notes | Special instructions, patient gate codes, etc. |
| `prescription_file` | File | Optional | Images (JPG, PNG, WEBP) or PDF documents (Max 5 MB) | Uploaded doctor prescription or hospital discharge summary. |
| `honeypot` | String | Optional | Hidden field | Anti-spam field. Must be left blank by legitimate users. If populated by bots, returns fake success. |

---

## 7. Request Examples

### A. Server-Side HTTP Request (Without File Attachment)

```http
POST /api/bookings/public/ HTTP/1.1
Host: portal.ehealthpk.com
Content-Type: application/json
X-Public-Key: secret_public_website_key_2026

{
  "source": "public_website",
  "patient_name": "Tahir Mehmood",
  "phone": "+923005551234",
  "email": "tahir.family@example.com",
  "gender": "M",
  "date_of_birth": "1960-05-15",
  "address": "House 14, Street 8, Sector F-8/2, Islamabad",
  "latitude": 33.7145,
  "longitude": 73.0422,
  "service_type": "general_nursing",
  "shift_duration": "8_hours",
  "shift_frequency": "daily",
  "scheduled_time": "2026-10-15T09:00:00Z",
  "payment_method": "cash_on_delivery",
  "amount": 4500,
  "diagnosis": "Post-stroke rehabilitation and catheter management",
  "allergies": "Penicillin",
  "emergency_contact_name": "Kamran Tahir",
  "emergency_contact_phone": "+923005559876",
  "emergency_contact_relation": "Son",
  "notes": "Patient requires daily vitals check and wound dressing.",
  "has_prescription": true,
  "honeypot": ""
}
```

### B. Multipart Form Request (With Prescription Upload)

```bash
curl -X POST https://portal.ehealthpk.com/api/bookings/public/ \
  -H "X-Public-Key: secret_public_website_key_2026" \
  -F "source=public_website" \
  -F "patient_name=Fatima Bibi" \
  -F "phone=+923218889900" \
  -F "gender=F" \
  -F "patient_age=72" \
  -F "address=Flat 4B, Blue Area, Islamabad" \
  -F "service_type=critical_care" \
  -F "shift_duration=12_hours" \
  -F "shift_frequency=daily" \
  -F "scheduled_time=2026-10-12T08:00:00Z" \
  -F "has_prescription=true" \
  -F "prescription_file=@/path/to/discharge_summary.pdf" \
  -F "notes=Tracheostomy care and continuous monitoring required." \
  -F "honeypot="
```

---

## 8. Response Codes & Payloads

### Success Response: HTTP 201 Created

```json
{
  "booking_reference": "BK-2026-0042",
  "patient_mr_number": "MR-2026-0038",
  "status": "pending",
  "patient_id": 38,
  "booking_id": 42
}
```

### Error Responses

#### 1. Missing Phone Number: HTTP 400 Bad Request
```json
{
  "error": "Patient contact phone number is required."
}
```

#### 2. Invalid Source: HTTP 400 Bad Request
```json
{
  "error": "Invalid source \"external\". Allowed values: public_website, public_mobile_app."
}
```

#### 3. Upload Exceeds 5 MB: HTTP 400 Bad Request
```json
{
  "error": "Uploaded file exceeds the maximum allowed size of 5 MB."
}
```

#### 4. Invalid File Format / Signature: HTTP 400 Bad Request
```json
{
  "error": "Invalid file content. File header does not match a valid JPEG, PNG, WEBP, or PDF signature."
}
```

#### 5. Missing or Invalid Shared Key: HTTP 403 Forbidden
```json
{
  "error": "Forbidden: Invalid or missing API key in X-Public-Key header."
}
```

#### 6. Rate Limit Exceeded: HTTP 429 Too Many Requests
```json
{
  "detail": "Request was throttled. Expected available in 3240 seconds."
}
```

---

## 9. Internal Hospital Operating System Workflow

When this API is called:
1. **Patient Record Created:** A new Electronic Medical Record (EMR) is created with source set to `"Public Website"`, generating a unique Medical Record number (`MR-YYYY-XXXX`).
2. **Booking Record Created:** A booking record is registered in `pending` status.
3. **CRM Lead Generated:** A sales/intake lead is logged in the CRM module under stage `New Lead`, with source `"public_website"` and the booking notes.
4. **Instant Admin Notifications:** In-app real-time notifications are dispatched immediately to all Super Admins, Branch Managers, and CRM Executives.
5. **Care Coordination & Portal Account:** The care manager contacts the family, assigns an accredited nurse, and uses the **"Make Permanent Patient"** feature to generate secure credentials for the patient's Family Portal.
