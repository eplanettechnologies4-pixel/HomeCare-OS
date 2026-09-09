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

// REST endpoints
export const sendGPSPing = (booking_id, lat, lng) =>
  api.post('/api/tracking/gps-ping/', { booking_id, lat, lng });

export const checkIn  = (booking_id, lat, lng, method = 'manual') =>
  api.post('/api/tracking/check-in/',  { booking_id, lat, lng, method });

export const checkOut = (booking_id, lat, lng) =>
  api.post('/api/tracking/check-out/', { booking_id, lat, lng });

export const triggerSOS = (booking_id, lat, lng) =>
  api.post('/api/tracking/sos/', { booking_id, lat, lng });

// WebSocket (for real-time dashboard sync)
let ws = null;

export const connectWS = async () => {
  const token = await AsyncStorage.getItem('access_token');
  const wsUrl = BASE_URL.replace('http', 'ws');
  ws = new WebSocket(`${wsUrl}/ws/tracking/?token=${token}`);
  ws.onclose = () => setTimeout(connectWS, 5000); // auto-reconnect
  return ws;
};

export const sendLocationViaWS = (staffId, lat, lng) => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'location_update', staff_id: staffId, lat, lng }));
  }
};

export const sendSOSViaWS = (bookingId, lat, lng) => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'sos', booking_id: bookingId, lat, lng }));
  }
};
```

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
  const queue = JSON.parse(await AsyncStorage.getItem(QUEUE_KEY) || '[]');
  if (queue.length === 0) return;

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
      item.retryCount += 1;
      if (item.retryCount < 5) {
        remaining.push(item);
      }
    }
  }

  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
};

// Automatic listener on network re-establishment
export function initOfflineSyncListener() {
  NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable) {
      console.log('[OfflineQueue] Internet detected. Starting queue flush...');
      flushOfflineQueue();
    }
  });
}
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

---
*End of Integration Architecture Document.*

