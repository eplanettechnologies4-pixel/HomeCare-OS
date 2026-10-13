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

    const host = window.location.hostname || '127.0.0.1';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // If running in Vite dev server (usually :5173), target backend :8000 directly
    const defaultWsPort = window.location.port === '5173' ? '8000' : (window.location.port || (window.location.protocol === 'https:' ? '443' : '80'));
    const wsPort = import.meta.env.VITE_WS_PORT || defaultWsPort;
    const portSuffix = (wsPort === '80' || wsPort === '443') ? '' : `:${wsPort}`;
    const wsUrl = import.meta.env.VITE_EVENTS_WS_URL || `${wsProtocol}//${host}${portSuffix}/ws/events/?token=${encodeURIComponent(token)}`;

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
