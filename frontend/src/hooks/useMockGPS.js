import { useEffect, useRef, useState } from 'react';
import useStore from '../store/useStore';

/**
 * Simulates a WebSocket GPS feed by randomly drifting active staff locations.
 *
 * In production, replace the setInterval with a real WebSocket connection:
 *   const ws = new WebSocket('ws://host/ws/tracking/');
 *   ws.onmessage = (e) => { const data = JSON.parse(e.data); ... }
 */
export function useMockGPS(enabled = false) {
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    // Simulate GPS updates every 4 seconds
    intervalRef.current = setInterval(() => {
      const ACTIVE_STAFF_IDS = [1, 2, 5]; // staff currently on visit / en-route
      ACTIVE_STAFF_IDS.forEach((staffId) => {
        const latDrift = (Math.random() - 0.5) * 0.0008;
        const lngDrift = (Math.random() - 0.5) * 0.0008;

        useStore.setState((state) => {
          const visit = state.liveVisits.find((v) => v.assigned_staff?.id === staffId);
          if (!visit) return {};

          const baseLat = parseFloat(visit.staff_lat) || parseFloat(visit.assigned_staff?.current_latitude) || 33.57;
          const baseLng = parseFloat(visit.staff_lng) || parseFloat(visit.assigned_staff?.current_longitude) || 73.15;

          return {
            liveVisits: state.liveVisits.map((v) =>
              v.assigned_staff?.id === staffId
                ? { ...v, staff_lat: baseLat + latDrift, staff_lng: baseLng + lngDrift }
                : v
            ),
          };
        });
      });
    }, 4000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}

/**
 * Countdown timer hook.
 * @param {string|null} targetTimeISO - ISO datetime string to count down to
 * @returns {{ display: string, urgent: boolean }}
 */
export function useCountdown(targetTimeISO) {
  const [display, setDisplay] = useState('');
  const [urgent, setUrgent]   = useState(false);

  useEffect(() => {
    if (!targetTimeISO) return;

    const tick = () => {
      const diff = new Date(targetTimeISO) - new Date();
      setUrgent(diff < 120000 && diff > 0);
      if (diff <= 0) {
        setDisplay('OVERDUE');
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDisplay(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [targetTimeISO]);

  return { display, urgent };
}
