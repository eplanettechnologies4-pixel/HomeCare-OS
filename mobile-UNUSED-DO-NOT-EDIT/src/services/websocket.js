// src/services/websocket.js
// Mobile WebSocket Service for Zero-Latency Live Tracking & Emergency SOS
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { BASE_URL, AuthService } from './api';

// Safe helper to fetch token without throwing if AsyncStorage native module is null
const getSafeToken = async () => {
  try {
    if (AsyncStorage) {
      const token = await AsyncStorage.getItem('access_token');
      if (token) return token;
    }
  } catch (e) {
    // Ignore native module null error on web/dev-client
  }
  return AuthService?.getCurrentUser?.()?.token || null;
};

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
      const token = await getSafeToken();
      const rawBase = BASE_URL || 'http://179.198.198.179:8000';
      const wsProtocol = rawBase.startsWith('https') ? 'wss:' : 'ws:';
      const host = rawBase.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const wsUrl = `${wsProtocol}//${host}/ws/tracking/?token=${token}`;

      console.log('[MobileWS] Connecting to tracking channel:', wsUrl);

      if (this.ws) {
        try {
          this.ws.close();
        } catch (e) {}
      }

      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        console.log('[MobileWS] Connected to live field tracking channel.');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.listeners.forEach((cb) => {
            try { cb(payload); } catch (e) { console.error('[MobileWS] listener err:', e); }
          });
        } catch (err) {
          console.error('[MobileWS] Error parsing message:', err);
        }
      };

      socket.onclose = (e) => {
        this.isConnected = false;
        if (this.shouldStayConnected) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
          this.reconnectAttempts++;
          console.warn(`[MobileWS] Disconnected. Reconnecting in ${delay}ms...`, e?.reason);
          setTimeout(() => {
            if (this.shouldStayConnected) this.connect();
          }, delay);
        }
      };

      socket.onerror = (err) => {
        console.error('[MobileWS] Socket encountered error:', err.message || err);
      };
    } catch (e) {
      console.error('[MobileWS] Connection initialization error:', e);
    }
  }

  sendLocationUpdate(staffId, lat, lng) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = {
        type: 'location_update',
        staff_id: staffId,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      };
      this.ws.send(JSON.stringify(payload));
      console.log('[MobileWS -> Send location_update]', payload);
    }
  }

  sendSOSAlert(bookingId, lat, lng, staffId = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const user = AuthService?.getCurrentUser?.();
      const payload = {
        type: 'sos',
        booking_id: bookingId,
        staff_id: staffId || user?.staff_id || user?.id,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      };
      this.ws.send(JSON.stringify(payload));
      console.log('[MobileWS -> Send SOS]', payload);
    }
  }

  onMessage(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  disconnect() {
    console.log('[MobileWS] Disconnecting from tracking channel.');
    this.shouldStayConnected = false;
    this.isConnected = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}

export const mobileWS = new MobileWebSocketService();
export default mobileWS;
