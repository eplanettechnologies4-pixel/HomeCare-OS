import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

const STATUS_COLORS = {
  in_progress: '#2D6A4F',
  en_route:    '#DE9A3C',
  assigned:    '#3eb39e',
  completed:   '#6B7280',
};

// Great-circle Haversine formula
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function MiniMap({
  visits = [],
  height = 280,
  fullScreen = false,
  selectedStaffId = null,
  staffTrails = {},
  onSelectVisit,
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const patientMarkersRef = useRef({});
  const connectLineRef = useRef(null);
  const trailPolylineRef = useRef(null);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [33.5700, 73.1500],
      zoom: fullScreen ? 14 : 13,
      zoomControl: true,
      attributionControl: !fullScreen,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    mapInstance.current = map;
    return () => {
      map.remove();
      mapInstance.current = null;
      markersRef.current = {};
      patientMarkersRef.current = {};
      connectLineRef.current = null;
      trailPolylineRef.current = null;
    };
  }, []);

  // Update markers, patient destination, trail, and connecting line
  useEffect(() => {
    if (!mapInstance.current || !L) return;
    const map = mapInstance.current;

    // Clean up markers for removed visits
    Object.keys(markersRef.current).forEach((id) => {
      if (!visits.find((v) => String(v.id) === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Clean up patient destination markers
    Object.keys(patientMarkersRef.current).forEach((id) => {
      if (!visits.find((v) => String(v.id) === id) || (selectedStaffId && !visits.find((v) => String(v.id) === id && (v.assigned_staff?.id === selectedStaffId || v.staff_id === selectedStaffId)))) {
        patientMarkersRef.current[id].remove();
        delete patientMarkersRef.current[id];
      }
    });

    let selectedVisit = null;
    let selectedNurseCoords = null;
    let selectedPatientCoords = null;

    visits.forEach((visit) => {
      const lat = parseFloat(visit.staff_lat) || parseFloat(visit.current_latitude) || parseFloat(visit.latitude);
      const lng = parseFloat(visit.staff_lng) || parseFloat(visit.current_longitude) || parseFloat(visit.longitude);
      if (!lat || !lng) return;

      const visitStaffId = visit.assigned_staff?.id || visit.staff_id;
      const isSelected = selectedStaffId && visitStaffId === selectedStaffId;
      const isDimmed = selectedStaffId && !isSelected;

      if (isSelected) {
        selectedVisit = visit;
        selectedNurseCoords = [lat, lng];
      }

      // Check staleness: no ping for > 2 minutes (120 seconds)
      const lastPingTs = visit.last_ping_at
        ? new Date(visit.last_ping_at).getTime()
        : visit.last_update
        ? new Date(visit.last_update).getTime()
        : null;
      const secondsAgo = lastPingTs ? Math.floor((Date.now() - lastPingTs) / 1000) : null;
      const isStale = visit.is_stale || (secondsAgo !== null && secondsAgo > 120);

      // Stale turns marker grey and shows "Signal lost" label
      const baseColor = isStale ? '#6B7280' : (STATUS_COLORS[visit.status] || '#6B7280');
      const initials = (visit.staff_name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2);
      const size = isSelected ? 46 : 38;
      const opacity = isDimmed ? 0.35 : 1;

      const lastSeenText = secondsAgo !== null
        ? (secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`)
        : 'Unknown';

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;display:inline-block;">
            <div style="
              width:${size}px;height:${size}px;border-radius:50%;
              background:${baseColor};border:${isSelected ? '4px' : '3px'} solid white;
              box-shadow:${
                isSelected
                  ? `0 0 0 4px ${baseColor}66, 0 4px 14px rgba(0,0,0,0.35)`
                  : '0 2px 8px rgba(0,0,0,0.25)'
              };
              display:flex;align-items:center;justify-content:center;
              color:white;font-weight:700;font-size:${isSelected ? 14 : 11}px;
              font-family:'Inter',sans-serif;
              opacity:${opacity};
              transition:all 0.3s;
              ${visit.status === 'in_progress' && !isStale ? 'animation:pulse-map 2s infinite;' : ''}
            ">${initials}</div>
            
            ${isStale ? `
              <div style="
                position:absolute;top:-10px;left:50%;transform:translateX(-50%);
                background:#374151;color:#f3f4f6;font-size:9px;font-weight:700;
                padding:1px 5px;border-radius:4px;white-space:nowrap;
                box-shadow:0 1px 3px rgba(0,0,0,0.3);letter-spacing:0.02em;
              ">
                Signal lost
              </div>
            ` : (visit.status === 'in_progress' ? `
              <div style="
                position:absolute;top:-3px;right:-3px;
                width:11px;height:11px;border-radius:50%;
                background:#2D6A4F;border:2px solid white;
                opacity:${opacity};
              "></div>
            ` : '')}
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2 - 4],
      });

      const popup = `
        <div style="font-family:'Inter',sans-serif;min-width:200px;font-size:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="color:#123832;font-size:13px;">${visit.staff_name || '—'}</strong>
            <span style="font-size:10px;padding:1px 5px;border-radius:4px;background:${baseColor};color:white;font-weight:700;">
              ${isStale ? 'Signal lost' : (visit.status_display || visit.status)}
            </span>
          </div>
          <div style="color:#4b5563;">Patient: <strong>${visit.patient_name}</strong></div>
          <div style="color:#4b5563;margin-top:2px;">Last seen: <strong>${lastSeenText}</strong></div>
          ${visit.speed !== undefined && visit.speed !== null ? `<div style="color:#4b5563;margin-top:2px;">Speed: <strong>${Math.round(visit.speed)} km/h</strong></div>` : ''}
          ${visit.battery_level !== undefined && visit.battery_level !== null ? `<div style="color:#4b5563;margin-top:2px;">Battery: <strong>${visit.battery_level}%</strong></div>` : ''}
          ${visit.eta_minutes ? `<div style="color:var(--amber-600,#b87320);font-weight:600;margin-top:4px;">ETA: ${visit.eta_minutes} min</div>` : ''}
        </div>
      `;

      const existingMarker = markersRef.current[String(visit.id)];
      if (existingMarker) {
        existingMarker.setLatLng([lat, lng]);
        existingMarker.setIcon(icon);
      } else {
        const marker = L.marker([lat, lng], { icon }).bindPopup(popup);
        marker.on('click', () => {
          onSelectVisit?.(visit);
        });
        marker.addTo(map);
        markersRef.current[String(visit.id)] = marker;
      }
    });

    // ── Patient Destination Marker, Trail, & Connecting Line for Selected Nurse ──
    if (selectedVisit && selectedNurseCoords) {
      const patLat = parseFloat(selectedVisit.patient_lat || selectedVisit.booking?.latitude);
      const patLng = parseFloat(selectedVisit.patient_lng || selectedVisit.booking?.longitude);

      if (patLat && patLng) {
        selectedPatientCoords = [patLat, patLng];

        // 1. Patient Destination Marker
        const patIcon = L.divIcon({
          className: '',
          html: `
            <div style="
              width:38px;height:38px;border-radius:50%;
              background:#7C3AED;border:3px solid white;
              box-shadow:0 3px 12px rgba(124,58,237,0.45);
              display:flex;align-items:center;justify-content:center;
              color:white;font-size:16px;font-family:'Inter',sans-serif;
            ">🏠</div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
          popupAnchor: [0, -22],
        });

        const patPopup = `
          <div style="font-family:'Inter',sans-serif;min-width:180px;font-size:12px;">
            <div style="font-weight:700;color:#7C3AED;margin-bottom:2px;">Patient Destination</div>
            <div style="font-size:13px;font-weight:600;">${selectedVisit.patient_name}</div>
            <div style="color:#6b7280;margin-top:3px;">${selectedVisit.patient_address || 'Home Healthcare Visit'}</div>
          </div>
        `;

        if (patientMarkersRef.current[String(selectedVisit.id)]) {
          patientMarkersRef.current[String(selectedVisit.id)].setLatLng([patLat, patLng]);
        } else {
          const patMarker = L.marker([patLat, patLng], { icon: patIcon }).bindPopup(patPopup);
          patMarker.addTo(map);
          patientMarkersRef.current[String(selectedVisit.id)] = patMarker;
        }

        // 2. Dashed Connecting Line Between Nurse and Patient Destination
        const distKm = calculateDistanceKm(selectedNurseCoords[0], selectedNurseCoords[1], patLat, patLng);
        const distFormatted = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`;
        const etaText = selectedVisit.eta_minutes ? ` · ETA ${selectedVisit.eta_minutes}m` : '';

        const linePoints = [selectedNurseCoords, selectedPatientCoords];
        if (connectLineRef.current) {
          connectLineRef.current.setLatLngs(linePoints);
        } else {
          connectLineRef.current = L.polyline(linePoints, {
            color: '#7C3AED',
            weight: 3,
            dashArray: '6, 8',
            opacity: 0.75,
          }).addTo(map);
        }
        connectLineRef.current.bindPopup(`<strong>Distance:</strong> ${distFormatted}${etaText}`);
      }

      // 3. Draw Trail of the last 30 minutes of GPS pings for the selected nurse
      const staffId = selectedVisit.assigned_staff?.id || selectedVisit.staff_id;
      const rawTrail = (staffId && staffTrails[staffId]) ? staffTrails[staffId] : [];
      // Filter pings within the last 30 minutes (30 * 60 * 1000 ms)
      const now = Date.now();
      const recentPings = rawTrail.filter((p) => {
        if (!p.ts) return true;
        const pTime = typeof p.ts === 'number' ? p.ts : new Date(p.ts).getTime();
        return now - pTime <= 30 * 60 * 1000;
      });

      if (recentPings.length >= 2) {
        const trailPoints = recentPings.map((p) => [p.lat, p.lng]);
        if (trailPolylineRef.current) {
          trailPolylineRef.current.setLatLngs(trailPoints);
        } else {
          trailPolylineRef.current = L.polyline(trailPoints, {
            color: STATUS_COLORS[selectedVisit.status] || '#DE9A3C',
            weight: 4,
            opacity: 0.85,
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(map);
        }
      } else if (trailPolylineRef.current) {
        trailPolylineRef.current.setLatLngs([]);
      }

      // 4. Auto-fit bounds
      const fitPoints = [selectedNurseCoords];
      if (selectedPatientCoords) fitPoints.push(selectedPatientCoords);
      if (recentPings.length > 0) {
        recentPings.forEach((p) => fitPoints.push([p.lat, p.lng]));
      }

      if (fitPoints.length >= 2) {
        try {
          map.fitBounds(L.latLngBounds(fitPoints), { padding: [40, 40], maxZoom: 16 });
        } catch (_) {}
      }
    } else {
      // Clear line & trail when no staff selected
      if (connectLineRef.current) {
        connectLineRef.current.remove();
        connectLineRef.current = null;
      }
      if (trailPolylineRef.current) {
        trailPolylineRef.current.remove();
        trailPolylineRef.current = null;
      }
    }
  }, [visits, selectedStaffId, staffTrails, onSelectVisit]);

  return (
    <div
      ref={mapRef}
      className="map-container"
      style={{ width: '100%', height: height, minHeight: height }}
    >
      <style>{`
        @keyframes pulse-map {
          0%, 100% { box-shadow: 0 0 0 0 rgba(45,106,79,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(45,106,79,0); }
        }
      `}</style>
    </div>
  );
}
