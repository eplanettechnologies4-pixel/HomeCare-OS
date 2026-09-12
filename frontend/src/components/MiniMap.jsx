import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

const STATUS_COLORS = {
  in_progress: '#2D6A4F',
  en_route:    '#DE9A3C',
  assigned:    '#3eb39e',
  completed:   '#6B7280',
};

export default function MiniMap({ visits = [], height = 280, fullScreen = false }) {
  const mapRef       = useRef(null);
  const mapInstance  = useRef(null);
  const markersRef   = useRef({});

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
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // Update markers when visits change
  useEffect(() => {
    if (!mapInstance.current || !L) return;
    const map = mapInstance.current;

    // Remove old markers not in current visits
    Object.keys(markersRef.current).forEach((id) => {
      if (!visits.find((v) => String(v.id) === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    visits.forEach((visit) => {
      const lat = parseFloat(visit.staff_lat) || parseFloat(visit.latitude);
      const lng = parseFloat(visit.staff_lng) || parseFloat(visit.longitude);
      if (!lat || !lng) return;

      const color = STATUS_COLORS[visit.status] || '#6B7280';
      const initials = (visit.staff_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2);

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            width:36px;height:36px;border-radius:50%;
            background:${color};border:3px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
            display:flex;align-items:center;justify-content:center;
            color:white;font-weight:700;font-size:11px;
            font-family:'Inter',sans-serif;
            ${visit.status === 'in_progress' ? 'animation:pulse-map 2s infinite;' : ''}
          ">${initials}</div>
          ${visit.status === 'in_progress' ? `<div style="
            position:absolute;top:-4px;right:-4px;
            width:10px;height:10px;border-radius:50%;
            background:#2D6A4F;border:2px solid white;
          "></div>` : ''}
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });

      const popup = `
        <div style="font-family:'Inter',sans-serif;min-width:180px;">
          <div style="font-weight:700;color:#123832;margin-bottom:4px;">${visit.staff_name || '—'}</div>
          <div style="font-size:12px;color:#4b5563;">Patient: <strong>${visit.patient_name}</strong></div>
          <div style="font-size:12px;color:#4b5563;margin-top:2px;">Status: <span style="font-weight:600;color:${color};">${visit.status_display}</span></div>
          ${visit.eta_minutes ? `<div style="font-size:12px;color:var(--amber-600,#b87320);margin-top:2px;">ETA: ${visit.eta_minutes} min</div>` : ''}
        </div>
      `;

      const existingMarker = markersRef.current[String(visit.id)];
      if (existingMarker) {
        existingMarker.setLatLng([lat, lng]);
        existingMarker.setIcon(icon);
      } else {
        const marker = L.marker([lat, lng], { icon }).bindPopup(popup);
        marker.addTo(map);
        markersRef.current[String(visit.id)] = marker;
      }
    });
  }, [visits]);

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
