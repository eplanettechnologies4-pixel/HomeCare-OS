import { useEffect, useRef } from 'react';
import useStore from '../store/useStore';

/**
 * Web Audio API synthesizer for audible SOS emergency alarm chime
 */
export function playAlarmChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    // Two-tone urgent emergency chime
    osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch (A5)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25); // Drop to A4
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3); // High pulse again
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.55);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch (e) {
    console.warn('[AudioChime] Unable to play chime:', e);
  }
}

if (typeof window !== 'undefined' && !window.playAlarmChime) {
  window.playAlarmChime = playAlarmChime;
}

/**
 * Real-time WebSocket hook for Web Dashboard
 * Connects to ws://<host>:8000/ws/tracking/ and synchronizes live field staff GPS,
 * booking check-in/out statuses, and instantaneous SOS emergency alerts.
 */
export function useWebSocketTracking(token) {
  const wsRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    // Resolve host and port dynamically from window location or env
    const host = window.location.hostname || 'localhost';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultWsPort = window.location.port === '5173' ? '8000' : (window.location.port || (window.location.protocol === 'https:' ? '443' : '80'));
    const wsPort = import.meta.env.VITE_WS_PORT || defaultWsPort;
    const portSuffix = (wsPort === '80' || wsPort === '443') ? '' : `:${wsPort}`;
    const wsUrl = import.meta.env.VITE_WS_URL || `${wsProtocol}//${host}${portSuffix}/ws/tracking/?token=${encodeURIComponent(token)}`;

    let isSubscribed = true;
    let reconnectTimeout = null;

    const connect = () => {
      try {
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
      } catch (e) {
        console.error('[TrackingWS] Connection initialization error:', e);
      }
    };

    connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [token]);

  return wsRef;
}

/**
 * Dispatch incoming WS events into the central store
 */
function handleWebSocketMessage(msg) {
  switch (msg.type) {
    case 'location_update': {
      const lat = parseFloat(msg.lat);
      const lng = parseFloat(msg.lng);
      useStore.setState((prev) => ({
        liveVisits: (prev.liveVisits || []).map((v) => {
          const staffId = v.assigned_staff?.id || v.staff?.id || v.staff_id || v.staff;
          if (staffId === msg.staff_id || v.id === msg.booking_id) {
            return {
              ...v,
              staff_lat: lat,
              staff_lng: lng,
              current_latitude: lat,
              current_longitude: lng,
              eta_minutes: msg.eta_minutes ?? v.eta_minutes,
              last_ping: new Date().toISOString(),
            };
          }
          return v;
        }),
      }));
      // Append to the per-staff trail ring buffer (max 30 pings) so the
      // StaffProfilePanel polyline grows in real time via the existing WS feed.
      if (msg.staff_id) {
        useStore.getState().appendStaffPing(msg.staff_id, lat, lng);
      }
      break;
    }

    case 'sos': {
      console.error('[CRITICAL SOS ALERT]', msg);
      if (typeof window !== 'undefined' && typeof window.playAlarmChime === 'function') {
        try { window.playAlarmChime(); } catch (e) {}
      }
      const newAlert = {
        id: msg.sos_id || Date.now(),
        bookingId: msg.booking_id,
        booking_id: msg.booking_id,
        staffId: msg.staff_id,
        staff_name: msg.staff_name || 'Field Staff',
        patient_name: msg.patient_name || 'Patient',
        lat: parseFloat(msg.lat),
        lng: parseFloat(msg.lng),
        latitude: parseFloat(msg.lat),
        longitude: parseFloat(msg.lng),
        timestamp: new Date().toISOString(),
        triggered_at: new Date().toISOString(),
        status: 'active',
      };
      useStore.setState((prev) => ({
        activeSosAlerts: [
          newAlert,
          ...(prev.activeSosAlerts || []).filter((a) => a.id !== newAlert.id),
        ],
        sosEvents: [
          newAlert,
          ...(prev.sosEvents || []).filter((s) => s.id !== newAlert.id),
        ],
      }));
      break;
    }

    case 'sos_resolved': {
      useStore.setState((prev) => ({
        activeSosAlerts: (prev.activeSosAlerts || []).filter((a) => a.id !== msg.sos_id),
        sosEvents: (prev.sosEvents || []).map((s) =>
          s.id === msg.sos_id ? { ...s, status: 'resolved', resolved_at: new Date().toISOString() } : s
        ),
      }));
      break;
    }

    case 'geofence_event': {
      const { booking_id, event_type } = msg;
      const newStatus = event_type === 'check_in' ? 'in_progress' : event_type === 'check_out' ? 'completed' : event_type;
      const newStatusDisplay = newStatus === 'in_progress' ? 'In Progress' : newStatus === 'completed' ? 'Completed' : 'En Route';

      useStore.setState((prev) => ({
        liveVisits: (prev.liveVisits || []).map((v) =>
          v.id === booking_id
            ? {
                ...v,
                status: newStatus,
                status_display: newStatusDisplay,
                actual_start_time: event_type === 'check_in' ? (msg.timestamp || new Date().toISOString()) : v.actual_start_time,
              }
            : v
        ),
        geofenceEvents: [
          {
            id: msg.event_id || Date.now(),
            booking_id,
            event_type,
            event_type_display: event_type === 'check_in' ? 'Check In (Arrived)' : 'Check Out (Departed)',
            timestamp: msg.timestamp || new Date().toISOString(),
            latitude: msg.lat,
            longitude: msg.lng,
            staff_name: msg.staff_name || 'Field Staff',
            patient_name: msg.patient_name || 'Patient',
            visit_duration_minutes: msg.visit_duration_minutes,
          },
          ...(prev.geofenceEvents || []),
        ],
      }));
      break;
    }

    default:
      break;
  }
}
