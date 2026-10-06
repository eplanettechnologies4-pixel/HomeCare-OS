import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL, AuthService } from './api';

// Safe helper to fetch token without throwing if AsyncStorage native module is null
const getSafeToken = async () => {
  try {
    if (AsyncStorage) {
      const token = await AsyncStorage.getItem('access_token');
      if (token) return token;
    }
  } catch (e) {
    // Ignore native module null error
  }
  return AuthService?.getCurrentUser?.()?.token || null;
};

// REST endpoints
export const sendGPSPing = (booking_id, lat, lng) =>
  api.post('/api/tracking/gps-ping/', { booking_id, lat, lng });

export const checkIn = (booking_id, lat, lng, method = 'manual') =>
  api.post('/api/tracking/check-in/', { booking_id, lat, lng, method });

export const checkOut = (booking_id, lat, lng) =>
  api.post('/api/tracking/check-out/', { booking_id, lat, lng });

export const triggerSOS = (booking_id, lat, lng) =>
  api.post('/api/tracking/sos/', { booking_id, lat, lng });

// WebSocket (for real-time dashboard sync)
let ws = null;

export const connectWS = async () => {
  try {
    const token = await getSafeToken();
    const wsUrl = (BASE_URL || 'http://179.198.198.179:8000').replace(/^http/, 'ws');
    ws = new WebSocket(`${wsUrl}/ws/tracking/?token=${token}`);
    ws.onclose = () => setTimeout(connectWS, 5000);
    return ws;
  } catch (e) {
    console.warn('[tracking.js connectWS error]', e);
  }
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

export default {
  sendGPSPing,
  checkIn,
  checkOut,
  triggerSOS,
  connectWS,
  sendLocationViaWS,
  sendSOSViaWS,
};
