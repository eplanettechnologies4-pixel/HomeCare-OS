# 📱 HomeCare OS — Mobile Application

Enterprise React Native / Expo mobile application for **HomeCare OS (Hospital at Home)**, purpose-built for field clinicians (nurses, therapists, medical doctors) and patient families.

---

## 🌟 Capabilities

- 🔐 **Real JWT Authentication** — Username or email login against Django REST Framework with auto-refresh interceptor
- 📍 **Battery-Conscious Background GPS Tracking** — `homecare-location-task` via `expo-task-manager` transmitting 30s pings with 10m distance filter
- 🚨 **Emergency SOS Panic Trigger** — Instant distress dispatch via dual REST + WebSocket broadcast
- 📋 **Form A (Nurse Notes) & Photo Upload** — Bedside clinical notes and multipart wound care photo uploads
- 🩺 **Form B (Vitals Entry)** — Clinical parameters with automatic abnormal threshold warnings
- 💊 **Form C (MAR Sheet)** — Scheduled medication dose administration with duplicate prevention (`409 Conflict`)
- 🏠 **Family Portal Mobile App** — Real-time nurse arrival tracking, past visit history, vitals trends, and invoice balances
- 📴 **Offline-First Resiliency** — AsyncStorage mutation queue with idempotency keys, replayed on reconnection

---

## 📁 Directory Structure

```
mobile/
├── App.js                     # Root navigation, auth listener, offline banner
├── app.json                   # Expo configuration & permission declarations
├── package.json               # Expo 57, React Native 0.86, React 19
└── src/
    ├── components/            # UI components (buttons, badges, toast, skeleton)
    ├── screens/               # 19 Clinician workflow screens
    │   ├── AttendanceScreen.js
    │   ├── CheckoutScreen.js
    │   ├── DailyReportScreen.js
    │   ├── HomeScreen.js
    │   ├── LeaveRequestScreen.js
    │   ├── LoginScreen.js
    │   ├── ManagerViewScreen.js
    │   ├── NotificationsScreen.js
    │   ├── NursesNoteScreen.js
    │   ├── OnboardingScreen.js
    │   ├── PhotoViewerScreen.js
    │   ├── ProfileScreen.js
    │   ├── ResetPasswordScreen.js
    │   ├── SplashScreen.js
    │   ├── TodayScheduleScreen.js
    │   ├── TodaysMedsScreen.js
    │   ├── VisitDetailScreen.js
    │   ├── VitalsEntryScreen.js
    │   ├── WelcomeScreen.js
    │   └── family/            # 6 Family Portal screens
    │       ├── FamilyHomeScreen.js
    │       ├── FamilyInvoicesScreen.js
    │       ├── FamilyLiveTrackingScreen.js
    │       ├── FamilyMessagesScreen.js
    │       ├── MyVisitsScreen.js
    │       └── VitalsTrendScreen.js
    ├── services/              # API client, GPS tracking, WebSockets, offline queue
    └── theme/                 # Design tokens (colors, typography, spacing)
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd mobile
npm install
```

### 2. Configure Backend Connection
Set your local machine's LAN IP address in `src/services/api.js` or environment:
```javascript
// Replace with your machine's LAN IP (e.g. 192.168.1.50)
const API_BASE_URL = 'http://192.168.1.50:8000/api';
```

> ⚠️ Mobile devices cannot access `localhost` directly. Always use your host machine's Wi-Fi / LAN IP address.

### 3. Run the Development Server
```bash
npx expo start
```

Scan the QR code with **Expo Go** on your physical iOS or Android smartphone.
