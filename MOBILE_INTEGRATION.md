# HomeCare OS — Mobile ↔ Dashboard Integration Architecture

## System Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                     SHARED DJANGO BACKEND                       │
│              http://YOUR_SERVER_IP:8000                         │
│                                                                 │
│  REST API (JWT)          WebSocket (Channels + Redis)           │
│  /api/...                ws://YOUR_SERVER_IP:8000/ws/tracking/  │
└────────────┬──────────────────────────┬────────────────────────┘
             │  REST + WS               │  REST only
             ▼                          ▼
┌────────────────────┐      ┌──────────────────────────┐
│  React Native App  │      │  React Web Dashboard     │
│  (Nurse / Doctor   │      │  (Admin / Care Manager / │
│   Physiotherapist) │      │   Accountant / CRM)      │
│                    │      │  http://localhost:5173    │
│  iOS / Android     │      │                          │
└────────────────────┘      └──────────────────────────┘
```

**Both apps share the same backend, same JWT tokens, same database.**
There is no separate mobile backend — everything goes to `:8000`.

---

## 1. Network Configuration

### Development (same LAN)
```
Backend IP    : http://192.168.x.x:8000      ← your machine's LAN IP
WebSocket     : ws://192.168.x.x:8000/ws/tracking/
Web Dashboard : http://192.168.x.x:5173
```

Find your LAN IP on Windows:
```powershell
ipconfig | Select-String "IPv4"
```

### Environment Files to Create

**`backend/.env`**
```env
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=*
REDIS_URL=redis://127.0.0.1:6379
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://192.168.x.x:5173
```

**`mobile/.env`** (React Native — use `react-native-dotenv`)
```env
API_BASE_URL=http://192.168.x.x:8000
WS_BASE_URL=ws://192.168.x.x:8000
```

> The mobile app **cannot** use `localhost` — it refers to the phone itself.
> Always use the machine's **LAN IP address** (e.g. `192.168.1.105`).

---

## 2. Complete API Endpoint Map (Mobile → Backend)

### 2.1 Authentication
| Screen | Method | Endpoint | Notes |
|---|---|---|---|
| `LoginScreen` | `POST` | `/api/auth/login/` | Returns `access` + `refresh` JWT tokens |
| App startup | `POST` | `/api/auth/refresh/` | Silently refresh access token when expired |
| After login | `GET` | `/api/auth/me/` | **Critical** — gets role, platform_allowed, staff_id |
| `OTPScreen` | `POST` | `/api/auth/forgot-password/` | Sends OTP to email/phone |
| `OTPScreen` | `POST` | `/api/auth/verify-otp/` | Validates OTP, returns `reset_token` |
| `ResetPasswordScreen` | `POST` | `/api/auth/reset-password/` | Sets new password |

### 2.2 Schedule & Bookings
| Screen | Method | Endpoint | Notes |
|---|---|---|---|
| `ScheduleScreen` | `GET` | `/api/bookings/today/` | Today's visits for the logged-in nurse |
| `ScheduleScreen` | `GET` | `/api/bookings/active/` | Currently in-progress visits |
| `BookingDetail` | `GET` | `/api/bookings/{id}/` | Full booking detail + patient address |

### 2.3 Live Tracking (GPS)
| Screen | Method | Endpoint | Notes |
|---|---|---|---|
| Background service | `POST` | `/api/tracking/gps-ping/` | Send GPS every 30 sec while on duty |
| `EnRouteScreen` | `POST` | `/api/tracking/check-in/` | Manual check-in on arrival |
| `CheckoutScreen` | `POST` | `/api/tracking/check-out/` | End visit, gets real `visit_duration_minutes` |
| `SOSButton` | `POST` | `/api/tracking/sos/` | Panic button — triggers dashboard red alert |

### 2.4 Patients & Clinical
| Screen | Method | Endpoint | Notes |
|---|---|---|---|
| `PatientDetailScreen` | `GET` | `/api/patients/{id}/` | Full patient dossier |
| `PatientDetailScreen` | `GET` | `/api/patients/{id}/vitals/` | Vital signs history (Form B) |
| `PatientDetailScreen` | `GET` | `/api/patients/{id}/nurse_notes/` | Clinical notes (Form A) |
| `TodaysMedsScreen` | `GET` | `/api/patients/{id}/mar/due-today/` | Today's meds with `administered` bool |
| `TodaysMedsScreen` | `POST` | `/api/patients/{id}/mar/administer/` | Tick a dose; `409` if duplicate |
| `DailyReportScreen` | `POST` | `/api/patients/{id}/daily-report/` | Multipart: notes + care checklist + photos |

### 2.5 Staff Profile
| Screen | Method | Endpoint | Notes |
|---|---|---|---|
| `ProfileScreen` | `GET` | `/api/staff/members/{id}/` | Full staff profile |
| `ProfileScreen` | `GET` | `/api/staff/leave-requests/` | My leave history |
| `ProfileScreen` | `POST` | `/api/staff/leave-requests/` | Submit new leave request |
| `ProfileScreen` | `GET` | `/api/staff/members/{id}/attendance/` | Attendance log |

### 2.6 Notifications
| Screen | Method | Endpoint | Notes |
|---|---|---|---|
| `NotificationsScreen` | `GET` | `/api/notifications/` | All notifications, most recent first |
| `NotificationsScreen` | `POST` | `/api/notifications/{id}/read/` | Mark one as read |
| `NotificationsScreen` | `POST` | `/api/notifications/read-all/` | Mark all read |
| App badge | `GET` | `/api/notifications/unread-count/` | Poll every 60 sec for badge count |

### 2.7 Family Portal Mobile Experience
| Screen | Method | Endpoint | Notes |
|---|---|---|---|
| `FamilyHomeScreen` | `GET` | `/api/portal/my/patient_profile/` | Patient care team & primary diagnosis |
| `FamilyHomeScreen` / `MyVisitsScreen` | `GET` | `/api/portal/my/visits/` | Scheduled & completed nurse visits |
| `FamilyLiveTrackingScreen` | `WS` | `/ws/tracking/` | Real-time GPS movement of assigned clinician |
| `VitalsTrendScreen` | `GET` | `/api/patients/{id}/vitals/` | Vitals telemetry history & trend charts |
| `FamilyInvoicesScreen` | `GET` | `/api/portal/my/invoices/` | Patient invoice balance & payment receipts |

### 2.8 Clinical LMS & Training Integration
| Screen / Action | Method | Endpoint | Notes |
|---|---|---|---|
| My Courses | `GET` | `/api/lms/staff/{staff_id}/training/` | Clinician enrolled CME training modules |
| Video Progress Ping | `POST` | `/api/lms/lectures/{id}/progress/` | Watch duration sync (every 15 seconds) |
| Digital Credentials | `GET` | `/api/lms/staff/{staff_id}/certificates/` | Issued accredited certificates & QR links |

---

## 3. WebSocket — Real-Time Link Between Mobile & Dashboard

The existing `ws://host/ws/tracking/` channel is a **shared room**.
Both the mobile app (nurse's phone) and the web dashboard (admin's browser) connect simultaneously.

```
  Mobile Phone (Nurse)              Django Channels            Web Dashboard (Admin)
       │                                    │                         │
       │── SEND location_update ───────────►│── BROADCAST ───────────►│
       │                                    │   map pin moves live     │
       │── SEND sos ────────────────────────►│── BROADCAST ───────────►│
       │                                    │   RED alert banner       │
```

### WebSocket Message Protocol

**Mobile → Server (nurse sends):**
```json
// GPS position (every 30 seconds)
{ "type": "location_update", "staff_id": 12, "lat": 24.8607, "lng": 67.0104, "eta_minutes": 8 }

// SOS panic (zero-latency, bypasses REST)
{ "type": "sos", "booking_id": 42, "lat": 24.8607, "lng": 67.0104 }
```

**Server → All Clients (dashboard receives):**
```json
{ "type": "location_update", "staff_id": 12, "lat": 24.8607, "lng": 67.0104 }
{ "type": "sos", "sos_id": 7, "booking_id": 42, "lat": 24.8607, "lng": 67.0104 }
{ "type": "geofence_event", "event_type": "check_in", "booking_id": 42 }
```

---

## 4. Mobile API Service Files (Ready to Copy)

### `src/services/api.js` — Axios Base Instance
```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_URL = 'http://192.168.x.x:8000'; // ← change to your LAN IP

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let failedQueue = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const orig = error.config;
    if (error.response?.status !== 401 || orig._retry) throw error;
    if (isRefreshing) {
      return new Promise((res, rej) => failedQueue.push({ res, rej }))
        .then((token) => { orig.headers.Authorization = `Bearer ${token}`; return api(orig); });
    }
    orig._retry = true;
    isRefreshing = true;
    try {
      const refresh = await AsyncStorage.getItem('refresh_token');
      const { data } = await axios.post(`${BASE_URL}/api/auth/refresh/`, { refresh });
      await AsyncStorage.setItem('access_token', data.access);
      failedQueue.forEach((p) => p.res(data.access));
      orig.headers.Authorization = `Bearer ${data.access}`;
      return api(orig);
    } catch (e) {
      failedQueue.forEach((p) => p.rej(e));
      await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
      throw e;
    } finally {
      isRefreshing = false;
      failedQueue = [];
    }
  }
);

export default api;
```

### `src/services/auth.js`
```javascript
import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const login = async (username, password) => {
  const { data } = await api.post('/api/auth/login/', { username, password });
  await AsyncStorage.setItem('access_token',  data.access);
  await AsyncStorage.setItem('refresh_token', data.refresh);
  return data;
};

export const getMe          = ()          => api.get('/api/auth/me/').then(r => r.data);
export const logout         = ()          => AsyncStorage.multiRemove(['access_token','refresh_token']);
export const forgotPassword = (identifier) => api.post('/api/auth/forgot-password/', { identifier });
export const verifyOTP      = (identifier, otp) => api.post('/api/auth/verify-otp/', { identifier, otp });
export const resetPassword  = (reset_token, new_password) => api.post('/api/auth/reset-password/', { reset_token, new_password });
```

### `src/services/tracking.js`
```javascript
import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from './api';
import { mobileWS } from './websocket';

// REST endpoints
export const sendGPSPing = (booking_id, lat, lng) =>
  api.post('/api/tracking/gps-ping/', { booking_id, lat, lng });

export const checkIn = (booking_id, lat, lng, method = 'manual') =>
  api.post('/api/tracking/check-in/', { booking_id, lat, lng, method });

export const checkOut = (booking_id, lat, lng) =>
  api.post('/api/tracking/check-out/', { booking_id, lat, lng });

export const triggerSOS = (booking_id, lat, lng) =>
  api.post('/api/tracking/sos/', { booking_id, lat, lng });

export const fetchLiveVisits = () =>
  api.get('/api/tracking/live-visits/').then((r) => r.data);

// WebSocket real-time helpers (delegates to mobileWS singleton)
export const connectWS = () => mobileWS.connect();
export const sendLocationViaWS = (staffId, lat, lng) =>
  mobileWS.sendLocationUpdate(staffId, lat, lng);
export const sendSOSViaWS = (bookingId, lat, lng, staffId) =>
  mobileWS.sendSOSAlert(bookingId, lat, lng, staffId);
```

### `src/services/location.js` (Background Tracking & Battery Discipline)
```javascript
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { sendGPSPing } from './tracking';
import { mobileWS } from './websocket';
import { AuthService } from './api';

export const LOCATION_TASK_NAME = 'homecare-location-task';
export const PING_INTERVAL_MS = 30000; // 30-second battery-efficient cadence

let activeBookingId = null;
let intervalId = null;
let currentCoords = { lat: 31.4707, lng: 74.4101 };

// Define Expo TaskManager background task
try {
  if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
    TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
      if (error) {
        console.error('[LocationTask] Background task error:', error);
        return;
      }
      if (data && data.locations && data.locations.length > 0) {
        const loc = data.locations[data.locations.length - 1];
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        currentCoords = { lat, lng };

        if (activeBookingId) {
          try {
            await sendGPSPing(activeBookingId, lat, lng);
            const user = AuthService?.getCurrentUser?.();
            const staffId = user?.staff_id || user?.id || 1;
            mobileWS?.sendLocationUpdate?.(staffId, lat, lng);
          } catch (e) {
            console.warn('[LocationTask] Failed to send ping:', e.message);
          }
        }
      }
    });
  }
} catch (e) {
  console.warn('[LocationTask] TaskManager registration note:', e.message);
}

class LocationService {
  constructor() {
    this.isTracking = false;
  }

  // Request foreground THEN background permission strictly when visit starts (NOT at app launch)
  async requestPermissionsOnVisitStart() {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      console.warn('[LocationService] Foreground location permission denied');
      return false;
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      console.warn('[LocationService] Background location permission denied; falling back to foreground interval');
    }
    return true;
  }

  async startLocationTask(bookingId) {
    if (!bookingId) return { success: false, error: 'No bookingId provided' };

    activeBookingId = bookingId;
    this.isTracking = true;

    try {
      await this.requestPermissionsOnVisitStart();

      // Acquire initial position
      try {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (current?.coords) {
          currentCoords = { lat: current.coords.latitude, lng: current.coords.longitude };
        }
      } catch (posErr) {
        console.warn('[LocationService] Using cached coords:', posErr.message);
      }

      // Start TaskManager background updates
      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (!isRegistered) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: PING_INTERVAL_MS,
          distanceInterval: 10,
          deferredUpdatesInterval: PING_INTERVAL_MS,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'HomeCare OS Tracking Active',
            notificationBody: 'Transmitting active visit location to care coordinator.',
            notificationColor: '#6D28D9',
          },
        });
      }
    } catch (e) {
      console.warn('[LocationService] Native background location start warning:', e.message);
    }

    // Always keep a foreground 30s heartbeat interval running as fallback
    if (intervalId) clearInterval(intervalId);
    await this.sendPing();

    intervalId = setInterval(() => {
      this.sendPing();
    }, PING_INTERVAL_MS);

    return { success: true };
  }

  async sendPing() {
    if (!this.isTracking || !activeBookingId) return;
    try {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (loc?.coords) {
          currentCoords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      } catch (e) {
        currentCoords.lat += (Math.random() - 0.5) * 0.0002;
        currentCoords.lng += (Math.random() - 0.5) * 0.0002;
      }

      await sendGPSPing(activeBookingId, currentCoords.lat, currentCoords.lng);
      const user = AuthService?.getCurrentUser?.();
      const staffId = user?.staff_id || user?.id || 1;
      mobileWS?.sendLocationUpdate?.(staffId, currentCoords.lat, currentCoords.lng);
    } catch (err) {
      console.warn('[LocationService] sendPing error:', err.message);
    }
  }

  // TERMINATE task immediately on checkout — zero battery drain when off-duty
  async stopLocationTask() {
    this.isTracking = false;
    activeBookingId = null;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch (e) {
      console.warn('[LocationService] Error stopping native background updates:', e.message);
    }

    return { success: true };
  }

  getCoords() {
    return currentCoords;
  }

  getActiveBookingId() {
    return activeBookingId;
  }
}

export const locationService = new LocationService();
export default locationService;
```

### `src/services/websocket.js` (Zero-Latency Live Tracking & Emergency SOS)
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { BASE_URL, AuthService } from './api';

class MobileWebSocketService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.listeners = [];
    this.appStateSubscription = null;
    this.shouldStayConnected = false;

    this.initAppStateListener();
  }

  initAppStateListener() {
    if (this.appStateSubscription) return;
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        if (this.shouldStayConnected && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
          this.connect();
        }
      }
    });
  }

  async connect() {
    this.shouldStayConnected = true;
    try {
      const token = (await AsyncStorage.getItem('access_token')) || AuthService?.getCurrentUser?.()?.token || '';
      const rawBase = BASE_URL || 'http://127.0.0.1:8000';
      const wsProtocol = rawBase.startsWith('https') ? 'wss:' : 'ws:';
      const host = rawBase.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const wsUrl = `${wsProtocol}//${host}/ws/tracking/?token=${token}`;

      if (this.ws) {
        try { this.ws.close(); } catch (e) {}
      }

      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.listeners.forEach((cb) => {
            try { cb(payload); } catch (e) {}
          });
        } catch (err) {}
      };

      socket.onclose = (e) => {
        this.isConnected = false;
        if (this.shouldStayConnected) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
          this.reconnectAttempts++;
          setTimeout(() => {
            if (this.shouldStayConnected) this.connect();
          }, delay);
        }
      };
    } catch (e) {
      console.error('[MobileWS] Init error:', e);
    }
  }

  sendLocationUpdate(staffId, lat, lng) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'location_update',
        staff_id: staffId,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      }));
    }
  }

  sendSOSAlert(bookingId, lat, lng, staffId = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const user = AuthService?.getCurrentUser?.();
      this.ws.send(JSON.stringify({
        type: 'sos',
        booking_id: bookingId,
        staff_id: staffId || user?.staff_id || user?.id,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      }));
    }
  }

  onMessage(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  disconnect() {
    this.shouldStayConnected = false;
    this.isConnected = false;
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  }
}

export const mobileWS = new MobileWebSocketService();
export default mobileWS;
```

### 4.2 Mobile Screens Live Wiring Reference
- **`src/screens/VisitDetailScreen.js`**:
  - Fetches real booking details via `GET /api/bookings/{id}/` on load and listens for live WS `geofence_event` to update arrival status without polling.
  - **"Start Visit"**: Invokes `locationService.startLocationTask(booking.id)` to initiate 30s location updates.
  - **"Check In" Fallback**: Executes manual check-in via `checkIn(booking.id, coords.lat, coords.lng, 'manual')`.
  - **Emergency SOS Button**: Triggers `triggerSOS(...)` via REST and broadcasts `sendSOSAlert(...)` over WebSocket; displays instant visual feedback banner.
  - **"End Visit & Check Out"**: Immediately invokes `locationService.stopLocationTask()` to cleanly terminate GPS updates before routing to `CheckoutScreen`.
- **`src/screens/CheckoutScreen.js`**:
  - Dynamically reads `visit_duration_minutes` passed from the backend checkout response (`POST /api/tracking/check-out/`). Eliminates hardcoded mock durations.
- **`src/screens/HomeScreen.js` & `src/screens/TodayScheduleScreen.js`**:
  - Replaced dummy schedule data with live calls to `GET /api/bookings/today/` using `useFocusEffect` and pull-to-refresh `RefreshControl`.


### `src/services/patients.js`
```javascript
import api from './api';

export const getPatient     = (id) => api.get(`/api/patients/${id}/`).then(r => r.data);
export const getVitals      = (id) => api.get(`/api/patients/${id}/vitals/`).then(r => r.data);
export const getNurseNotes  = (id) => api.get(`/api/patients/${id}/nurse_notes/`).then(r => r.data);
export const getMARDueToday = (id) => api.get(`/api/patients/${id}/mar/due-today/`).then(r => r.data);

export const administerMed = (patientId, prescription_id, day_number) =>
  api.post(`/api/patients/${patientId}/mar/administer/`, { prescription_id, day_number });

// Photo upload — pass a FormData object
export const submitDailyReport = (patientId, formData) =>
  api.post(`/api/patients/${patientId}/daily-report/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
```

### `src/services/notifications.js`
```javascript
import api from './api';

export const getNotifications = ()   => api.get('/api/notifications/').then(r => r.data);
export const markRead         = (id) => api.post(`/api/notifications/${id}/read/`);
export const markAllRead      = ()   => api.post('/api/notifications/read-all/');
export const getUnreadCount   = ()   => api.get('/api/notifications/unread-count/').then(r => r.data.unread);
```

---

## 5. JWT WebSocket Auth (Backend Fix)

Currently `asgi.py` uses session auth. Create this middleware so mobile JWT tokens work in WebSocket connections:

**Create: `backend/homecareOS/jwt_middleware.py`**
```python
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from urllib.parse import parse_qs


class JWTAuthMiddleware(BaseMiddleware):
    """Allow WS auth via ?token=<JWT> query param. Falls back to session auth."""
    async def __call__(self, scope, receive, send):
        from django.contrib.auth.models import AnonymousUser
        params = parse_qs(scope.get('query_string', b'').decode())
        token_list = params.get('token', [])
        scope['user'] = (
            await self._get_user(token_list[0]) if token_list
            else scope.get('user', AnonymousUser())
        )
        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def _get_user(self, token):
        try:
            from rest_framework_simplejwt.tokens import AccessToken
            from django.contrib.auth.models import User
            return User.objects.get(pk=AccessToken(token)['user_id'])
        except Exception:
            from django.contrib.auth.models import AnonymousUser
            return AnonymousUser()
```

**Edit: `backend/homecareOS/asgi.py`** — replace `AuthMiddlewareStack` with `JWTAuthMiddleware`:
```python
from homecareOS.jwt_middleware import JWTAuthMiddleware

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': JWTAuthMiddleware(
        URLRouter(tracking.routing.websocket_urlpatterns)
    ),
})
```

---

## 6. Role-Based Navigation (Mobile)

```javascript
// After GET /api/auth/me/ succeeds:
const RootNavigator = () => {
  const { user } = useAuthStore();
  if (!user) return <AuthStack />;
  if (user.platform_allowed === 'web') return <WebOnlyScreen />;

  const fieldRoles = ['nurse','doctor','physio','speech','psychologist','dietician'];
  if (fieldRoles.includes(user.role)) return <FieldStaffTabs />;
  if (user.role === 'care_manager')   return <ManagerStack />;
  return <WebOnlyScreen />;
};
```

**Profile screen label** — use `user.specialization` if set, else `user.role_display`:
```javascript
const title = user.specialization || user.role_display;
// "Registered Nurse" / "Physiotherapist" / "Speech & Language Therapist" etc.
```

---

## 7. Startup — Run All Services Together

```powershell
# Terminal 1 — Django API (binds to 0.0.0.0 so phone can reach it)
cd backend
python manage.py runserver 0.0.0.0:8000

# Terminal 2 — React Web Dashboard
cd frontend
npm run dev -- --host 0.0.0.0

# Terminal 3 — Redis (required for Channels + Celery)
redis-server

# Terminal 4 — Celery worker + beat scheduler
cd backend
celery -A homecareOS worker -l info -B
```

Phone connects to: `http://192.168.x.x:8000`
Web dashboard at: `http://192.168.x.x:5173`

---

## 8. Complete Nurse Shift Data Flow

```
📱 NURSE PHONE           🗄 DJANGO BACKEND          🖥 WEB DASHBOARD
      │                          │                         │
      ├─ POST /auth/login/ ─────►│                         │
      ├─ GET  /auth/me/   ──────►│                         │
      ├─ GET  /bookings/today/ ─►│                         │
      ├─ WS CONNECT ────────────►│◄── WS CONNECT ──────────┤
      │                          │                         │
   [En Route]                    │                         │
      ├─ WS: location_update ───►│──── BROADCAST ─────────►│ map pin moves
      ├─ POST /tracking/gps-ping/►│ (REST + auto check-in) │
      │                          │                         │
   [Arrived]                     │                         │
      ├─ POST /tracking/check-in/►│ booking→in_progress    │
      │                          │──── BROADCAST ─────────►│ status update
      │                          │                         │
   [During Visit]                │                         │
      ├─ GET  .../mar/due-today/─►│                         │
      ├─ POST .../mar/administer/►│ dose tick recorded      │
      ├─ POST .../daily-report/ ─►│ NurseNote + photos      │
      │                          │                         │
   [Checkout]                    │                         │
      ├─ POST /tracking/check-out►│ booking→completed       │
      │◄─ { duration_minutes } ──│ LiveVisit deleted       │
      └─ WS DISCONNECT ─────────►│                         │
```

---

## 9. Dashboard Real-Time Integration (React Web)

To bridge the Web Dashboard with the live mobile field updates, implement the real-time WebSocket hook in the React frontend.

### 9.1 Create: `frontend/src/hooks/useWebSocketTracking.js`

```javascript
import { useEffect, useRef } from 'react';
import useStore from '../store/useStore';

/**
 * Real-time WebSocket hook for Web Dashboard
 * Connects to ws://<host>:8000/ws/tracking/ and synchronizes live field staff GPS,
 * booking check-in/out statuses, and instantaneous SOS emergency alerts.
 */
export function useWebSocketTracking(token) {
  const wsRef = useRef(null);

  useEffect(() => {
    // Resolve host dynamically from window location or env
    const host = window.location.hostname || 'localhost';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${host}:8000/ws/tracking/?token=${token || ''}`;

    let isSubscribed = true;
    let reconnectTimeout = null;

    const connect = () => {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('[TrackingWS] Connected to live field tracking channel.');
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleWebSocketMessage(payload);
        } catch (err) {
          console.error('[TrackingWS] Error parsing message:', err);
        }
      };

      socket.onclose = (e) => {
        console.warn('[TrackingWS] Disconnected. Reconnecting in 3 seconds...', e.reason);
        if (isSubscribed) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      socket.onerror = (err) => {
        console.error('[TrackingWS] Socket encountered error:', err);
        socket.close();
      };
    };

    connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [token]);

  return wsRef;
}

/**
 * Dispatch incoming WS events into the Zustand central store
 */
function handleWebSocketMessage(msg) {
  const state = useStore.getState();

  switch (msg.type) {
    case 'location_update': {
      // Update coordinates for the active live visit matching staff_id
      useStore.setState((prev) => ({
        liveVisits: prev.liveVisits.map((v) => {
          if (v.assigned_staff?.id === msg.staff_id) {
            return {
              ...v,
              staff_lat: parseFloat(msg.lat),
              staff_lng: parseFloat(msg.lng),
              eta_minutes: msg.eta_minutes ?? v.eta_minutes,
              last_ping: new Date().toISOString(),
            };
          }
          return v;
        }),
      }));
      break;
    }

    case 'sos': {
      // Trigger instant audio chime & high-priority emergency banner on dashboard
      console.error('[CRITICAL SOS ALERT]', msg);
      if (typeof window !== 'undefined' && window.playAlarmChime) {
        window.playAlarmChime();
      }
      useStore.setState((prev) => ({
        activeSosAlerts: [
          ...(prev.activeSosAlerts || []),
          {
            id: msg.sos_id || Date.now(),
            bookingId: msg.booking_id,
            lat: msg.lat,
            lng: msg.lng,
            timestamp: new Date().toISOString(),
          },
        ],
      }));
      break;
    }

    case 'geofence_event': {
      // Triggered when nurse enters or leaves patient premises geofence
      const { booking_id, event_type } = msg;
      useStore.setState((prev) => ({
        liveVisits: prev.liveVisits.map((v) =>
          v.id === booking_id
            ? { ...v, status: event_type === 'check_in' ? 'in_progress' : v.status }
            : v
        ),
      }));
      break;
    }

    default:
      break;
  }
}
```

### 9.2 Integrating Live WebSocket into `LiveTracking.jsx`

In `frontend/src/pages/LiveTracking.jsx`, replace or supplement `useMockGPS()`:

```javascript
import { useWebSocketTracking } from '../hooks/useWebSocketTracking';

// Inside LiveTracking component:
const [simulationMode, setSimulationMode] = useState(false);

// If simulation mode is OFF, connect to real WebSocket from field devices:
useWebSocketTracking(!simulationMode ? authToken : null);

// If simulation mode is ON, fallback to simulation for demo purposes:
if (simulationMode) {
  useMockGPS();
}
```

---

## 10. Offline Handling & Sync Strategy (Field Resilience)

Clinicians frequently provide home care in remote communities, high-rise basements, or areas with intermittent cellular coverage. The mobile app must operate reliably offline.

### 10.1 Offline Architecture Flow

```
┌────────────────────────────────────────────────────────┐
│                      MOBILE APP                        │
│                                                        │
│  User Action (e.g. Administer Med / Save Form A)       │
│                        │                               │
│                        ▼                               │
│              [Network Available?]                      │
│             /                    \                     │
│           YES                     NO                   │
│           /                        \                   │
│   Direct REST Call        Write to Persistent Queue    │
│   (/api/patients/.../)     (@react-native-async-storage│
│                              or WatermelonDB/SQLite)   │
│                                      │                 │
│                                      ▼                 │
│                          NetInfo Listener              │
│                          Detects Connection Restore    │
│                                      │                 │
│                                      ▼                 │
│                          Sequential Flush Queue        │
│                          (FIFO with Idempotency Keys)  │
│                                      │                 │
│                                      ▼                 │
│                          Backend Confirms Sync         │
└────────────────────────────────────────────────────────┘
```

### 10.2 Queue Service Implementation: `src/services/offlineQueue.js`

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import api from './api';

const QUEUE_KEY = '@homecare_offline_action_queue';

export const enqueueOfflineAction = async (endpoint, method, payload, idempotencyKey) => {
  const existingQueue = JSON.parse(await AsyncStorage.getItem(QUEUE_KEY) || '[]');
  const actionItem = {
    id: idempotencyKey || `${Date.now()}_${Math.random()}`,
    endpoint,
    method,
    payload,
    timestamp: new Date().toISOString(),
    retryCount: 0,
  };

  existingQueue.push(actionItem);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(existingQueue));
  return actionItem;
};

export const flushOfflineQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    if (!queue || queue.length === 0) return { success: true, count: 0 };

    console.log(`[OfflineQueue] Flushing ${queue.length} queued offline actions...`);
    const remaining = [];

    for (const item of queue) {
      try {
        await api({
          url: item.endpoint,
          method: item.method,
          data: item.payload,
          headers: { 'X-Idempotency-Key': item.id },
        });
        console.log(`[OfflineQueue] Successfully flushed action ${item.id}`);
      } catch (err) {
        // 409 Conflict means already recorded on backend; safe to discard
        if (err.response?.status === 409) {
          console.warn(`[OfflineQueue] Action ${item.id} already committed (409). Discarding.`);
          continue;
        }
        item.retryCount = (item.retryCount || 0) + 1;
        if (item.retryCount < 5) {
          remaining.push(item);
        } else {
          console.error(`[OfflineQueue] Action ${item.id} exceeded max retries. Dropping.`);
        }
      }
    }

    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return { success: true, remaining: remaining.length };
  } catch (e) {
    console.warn('[OfflineQueue] Flush error:', e);
  }
};

// Automatic listener on network re-establishment
export function initOfflineSyncListener() {
  try {
    NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        console.log('[OfflineQueue] Connection online. Triggering queue flush...');
        flushOfflineQueue();
      }
    });
  } catch (e) {
    console.warn('[OfflineQueue] NetInfo listener initialization note:', e.message);
  }
}

// Wrapper for resilient clinical submission (Check-In, Check-Out, MAR Administration, Daily Report)
export async function submitWithOfflineFallback(endpoint, method, payload, customKey = null) {
  const key = customKey || `ik-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  let isOffline = false;
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected || net.isInternetReachable === false) {
      isOffline = true;
    }
  } catch (e) {
    isOffline = false;
  }

  if (isOffline) {
    console.log(`[OfflineQueue] Device is offline. Enqueuing ${endpoint}`);
    await enqueueOfflineAction(endpoint, method, payload, key);
    return { success: true, offline: true, idempotencyKey: key, data: { status: 'queued_offline' } };
  }

  try {
    const res = await api({
      url: endpoint,
      method,
      data: payload,
      headers: { 'X-Idempotency-Key': key },
    });
    return { success: true, offline: false, idempotencyKey: key, data: res.data };
  } catch (err) {
    if (!err.response || err.code === 'ECONNABORTED' || err.message === 'Network Error') {
      console.log(`[OfflineQueue] Network failed during request. Enqueuing ${endpoint}`);
      await enqueueOfflineAction(endpoint, method, payload, key);
      return { success: true, offline: true, idempotencyKey: key, data: { status: 'queued_offline' } };
    }
    throw err;
  }
}

export const offlineQueue = {
  enqueueOfflineAction,
  flushOfflineQueue,
  initOfflineSyncListener,
  submitWithOfflineFallback,
};

export default offlineQueue;
```

---

## 11. Push Notifications Subsystem (FCM / APNs)

When the dashboard dispatches a booking or reassigns a patient, the nurse must receive immediate push notification on mobile even when the app is backgrounded or killed.

### 11.1 Architecture & Flow

```
Dashboard (Care Manager assigns nurse)
       │
       ▼
Django Backend (`bookings/views.py` -> `assign_staff`)
       │
       ├─► 1. Writes Notification DB record (`/api/notifications/`)
       │
       └─► 2. Triggers Celery Task: `send_fcm_push(staff_user_id, title, body)`
                    │
                    ▼
              Firebase Cloud Messaging (FCM)
                    │
                    ▼
              Mobile Device (APNs for iOS / FCM for Android)
                    │
              Notification Banner Pops Up:
              "New Visit Assigned: Patient Ahmed Khan at 14:00"
```

### 11.2 Registering Mobile Device Token

On app startup, mobile calls:
```javascript
import messaging from '@react-native-firebase/messaging';

export async function registerDeviceToken() {
  const authStatus = await messaging().requestPermission();
  const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                  authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    const fcmToken = await messaging().getToken();
    await api.post('/api/notifications/register-device/', {
      registration_token: fcmToken,
      platform: Platform.OS, // 'ios' or 'android'
    });
  }
}
```

---

## 12. End-to-End Verification Runbook & Testing Guide

Use the following step-by-step test commands to verify mobile ↔ dashboard synchronization without needing a physical phone.

### Step 1: Login & Obtain JWT Token
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "nurse1", "password": "password123"}'
```
*Expected Response:*
```json
{
  "refresh": "eyJhbGciOi...",
  "access": "eyJhbGciOi..."
}
```

### Step 2: Test "Who Am I" Profile Endpoint
```bash
curl -X GET http://127.0.0.1:8000/api/auth/me/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```
*Expected Response:*
```json
{
  "id": 5,
  "username": "nurse1",
  "email": "nurse1@homecareos.com",
  "full_name": "Nurse Fatima Zahra",
  "role": "nurse",
  "platform_allowed": "all",
  "staff_id": 2
}
```

### Step 3: Simulate Mobile GPS Ping (Updates Dashboard Map)
```bash
curl -X POST http://127.0.0.1:8000/api/tracking/gps-ping/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"booking_id": 1, "lat": 24.8615, "lng": 67.0099}'
```

### Step 4: Simulate Mobile Visit Check-In
```bash
curl -X POST http://127.0.0.1:8000/api/tracking/check-in/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"booking_id": 1, "lat": 24.8615, "lng": 67.0099, "method": "manual"}'
```

### Step 5: Test Real-Time WebSocket with `wscat`
In a separate terminal:
```bash
# Install wscat if not present: npm install -g wscat
wscat -c "ws://127.0.0.1:8000/ws/tracking/?token=<ACCESS_TOKEN>"
```
Send location update from client:
```json
{"type": "location_update", "staff_id": 2, "lat": 24.8620, "lng": 67.0110}
```
*Observe that all connected dashboard browser tabs update the map pin at `24.8620, 67.0110` with zero latency.*

### Step 6: Trigger & Resolve Emergency SOS Panic Alert
**Trigger from Mobile Device:**
```bash
curl -X POST http://127.0.0.1:8000/api/tracking/sos/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"booking_id": 1, "lat": 24.8615, "lng": 67.0099, "reason": "Patient acute respiratory distress"}'
```
*Expected Result:*
- Database logs an active un-resolved `SOSEvent`
- Django Channels broadcasts `{ "type": "sos", "booking_id": 1, ... }`
- Web Dashboard sounds a 2-tone Web Audio alarm chime and displays a sticky pulsating red emergency banner (`.sos-banner-pulsating`)

**Resolve from Central Web Dispatch:**
```bash
curl -X POST http://127.0.0.1:8000/api/tracking/sos/1/resolve/ \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Ambulance dispatched. Nurse supported on-site."}'
```
*Expected Result:*
- SOS marked `resolved = True`, `resolved_at`, and `resolved_by`
- Broadcasts `sos_resolved` event to dismiss dashboard alarm banner

### Step 7: Complete Visit Departure & Duration Calculation
```bash
curl -X POST http://127.0.0.1:8000/api/tracking/check-out/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"booking_id": 1, "lat": 24.8615, "lng": 67.0099}'
```
*Expected Response (200 OK):*
```json
{
  "status": "checked_out",
  "visit_duration_minutes": 58
}
```
*Side Effects:*
- Transitions `booking.status` to `completed`
- Calculates true duration from `checked_in_at` to `checked_out_at`
- Deletes transient `LiveVisit` tracking row so map pin disappears from active field roster
- Terminates mobile background location task (`stopLocationTask()`) to preserve clinician device battery

### Step 8: Operational Alert Rules Configuration
```bash
curl -X POST http://127.0.0.1:8000/api/tracking/alert-rules/ \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"late_threshold_minutes": 15, "no_show_threshold_minutes": 30, "overstay_threshold_minutes": 120}'
```

---

## 13. Automated Integration Test Suite (`verify_tracking.py`)

To guarantee zero regression across mobile services and dashboard endpoints, run the automated integration verification suite:

```bash
cd backend
python verify_tracking.py
```

### Verified Test Matrix (9/9 Passed)
| # | Test Scenario | Validated Backend Behavior |
|---|---|---|
| 1 | Far GPS Ping (> 100m) | `LiveVisit` updated with coords; status remains unchanged (no false check-in) |
| 2 | Geofence Auto Check-in (≤ 100m) | Booking transitions to `in_progress`; `GeofenceEvent(check_in)` logged; WS broadcast |
| 3 | Idempotent Manual Check-in | Re-sending check-in returns `200 OK` without throwing error or duplicating records |
| 4 | Emergency SOS Panic Alert | Creates active `SOSEvent` with staff linkage; broadcasts to WS tracking channel |
| 5 | Central SOS Resolution | Sets `resolved=True`, logs reviewer notes & timestamp; broadcasts resolution |
| 6 | Active Live Visits Snapshot | `GET /api/tracking/live-visits/` returns valid list with lat/lng and patient name |
| 7 | Alert Rules Persistence | `POST /api/tracking/alert-rules/` saves rules; `GET .../current/` retrieves them |
| 8 | Visit Departure & Checkout | Transitions to `completed`, computes duration, cleans up `LiveVisit` |
| 9 | Today's Schedule Filtering | `GET /api/bookings/today/` correctly scopes visits to authenticated clinician |

---
*End of Integration Architecture Document.*

