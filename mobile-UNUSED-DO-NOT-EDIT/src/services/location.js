// src/services/location.js
// Automatic Staff Location Tracking Manager (homecare-location-task)
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { sendGPSPing } from './tracking';
import { mobileWS } from './websocket';
import { AuthService } from './api';

export const LOCATION_TASK_NAME = 'homecare-location-task';
export const PING_INTERVAL_MS = 30000; // 30 seconds

let activeBookingId = null;
let intervalId = null;
let currentCoords = { lat: 31.4707, lng: 74.4101 };

// Define background TaskManager task
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

  // Request foreground THEN background permission only when visit starts (not at login)
  async requestPermissionsOnVisitStart() {
    console.log('[LocationService] Requesting foreground permission...');
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      console.warn('[LocationService] Foreground location permission denied');
      return false;
    }

    console.log('[LocationService] Requesting background permission...');
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      console.warn('[LocationService] Background location permission denied; falling back to foreground');
    }
    return true;
  }

  async startLocationTask(bookingId) {
    if (!bookingId) return { success: false, error: 'No bookingId provided' };

    activeBookingId = bookingId;
    this.isTracking = true;

    try {
      await this.requestPermissionsOnVisitStart();

      // Fetch initial position
      try {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (current && current.coords) {
          currentCoords = { lat: current.coords.latitude, lng: current.coords.longitude };
        }
      } catch (posErr) {
        console.warn('[LocationService] Could not get current position, using cached coords', posErr.message);
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
            notificationTitle: 'eHealth Hospital At Home Tracking Active',
            notificationBody: 'Transmitting active visit location to care coordinator.',
            notificationColor: '#6D28D9',
          },
        });
      }
    } catch (e) {
      console.warn('[LocationService] Native background location start warning:', e.message);
    }

    // Always ensure a foreground interval runs every 30s as a fallback / reliable heartbeat
    if (intervalId) clearInterval(intervalId);
    await this.sendPing();

    intervalId = setInterval(() => {
      this.sendPing();
    }, PING_INTERVAL_MS);

    console.log(`[LocationService] Task '${LOCATION_TASK_NAME}' started for booking ${bookingId}`);
    return { success: true };
  }

  async sendPing() {
    if (!this.isTracking || !activeBookingId) return;

    try {
      // Try to get fresh location if possible
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (loc?.coords) {
          currentCoords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      } catch (e) {
        // slight jitter if in emulator/simulator
        currentCoords.lat += (Math.random() - 0.5) * 0.0002;
        currentCoords.lng += (Math.random() - 0.5) * 0.0002;
      }

      console.log(`[LocationService] 30s ping for booking ${activeBookingId}:`, currentCoords);
      await sendGPSPing(activeBookingId, currentCoords.lat, currentCoords.lng);

      const user = AuthService?.getCurrentUser?.();
      const staffId = user?.staff_id || user?.id || 1;
      mobileWS?.sendLocationUpdate?.(staffId, currentCoords.lat, currentCoords.lng);
    } catch (err) {
      console.warn('[LocationService] sendPing error:', err.message);
    }
  }

  async stopLocationTask() {
    console.log(`[LocationService] Stopping task '${LOCATION_TASK_NAME}'...`);
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

    console.log(`[LocationService] Task '${LOCATION_TASK_NAME}' successfully stopped.`);
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
