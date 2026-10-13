import { useEffect, useRef } from 'react';
import useStore from '../store/useStore';

/**
 * Global Real-time WebSocket hook for HomeCare OS Web Dashboard.
 * Connects to ws://<host>/ws/events/?token=<JWT>
 * Handles events:
 *  - invoice.created / invoice.updated / invoice.paid
 *  - form.submitted
 *  - course.assigned / lecture.ready
 */
export function useRealtimeEvents(token) {
  const wsRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    let wsUrl;
    if (import.meta.env.VITE_EVENTS_WS_URL) {
      wsUrl = `${import.meta.env.VITE_EVENTS_WS_URL}?token=${encodeURIComponent(token)}`;
    } else if (window.location.protocol === 'https:') {
      wsUrl = `wss://${window.location.host}/ws/events/?token=${encodeURIComponent(token)}`;
    } else {
      const port = window.location.port === '5173' ? ':8000' : (window.location.port ? `:${window.location.port}` : '');
      wsUrl = `ws://${window.location.hostname}${port}/ws/events/?token=${encodeURIComponent(token)}`;
    }

    let isSubscribed = true;
    let reconnectTimeout = null;
    let pingInterval = null;

    function connect() {
      if (!isSubscribed) return;

      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          console.log('[RealtimeWS] Connected to /ws/events/');
          useStore.getState().setEventsWsConnected?.(true);

          // Heartbeat ping every 30s
          pingInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ action: 'ping', timestamp: Date.now() }));
            }
          }, 30000);
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'pong') return;
            console.log('[RealtimeWS] Event received:', payload.type, payload.data);
            useStore.getState().handleRealtimeEvent?.(payload);
          } catch (e) {
            console.warn('[RealtimeWS] Failed to parse message:', e);
          }
        };

        socket.onerror = (err) => {
          console.warn('[RealtimeWS] Socket error:', err);
        };

        socket.onclose = () => {
          console.log('[RealtimeWS] Disconnected. Reconnecting in 3s...');
          useStore.getState().setEventsWsConnected?.(false);
          clearInterval(pingInterval);
          if (isSubscribed) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        console.warn('[RealtimeWS] Connection setup error:', err);
        if (isSubscribed) {
          reconnectTimeout = setTimeout(connect, 4000);
        }
      }
    }

    connect();

    return () => {
      isSubscribed = false;
      clearTimeout(reconnectTimeout);
      clearInterval(pingInterval);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [token]);
}

export default useRealtimeEvents;
