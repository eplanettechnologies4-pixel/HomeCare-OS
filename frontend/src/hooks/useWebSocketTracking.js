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
      useStore.setState((prev) => ({
        liveVisits: (prev.liveVisits || []).map((v) => {
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
      console.error('[CRITICAL SOS ALERT]', msg);
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
      const { booking_id, event_type } = msg;
      useStore.setState((prev) => ({
        liveVisits: (prev.liveVisits || []).map((v) =>
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
