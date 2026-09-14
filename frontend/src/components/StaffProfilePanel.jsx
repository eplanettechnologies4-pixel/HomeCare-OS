import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { X, Phone, MapPin, User, Clock, Navigation, Activity } from "lucide-react";
import useStore from "../store/useStore";

const STATUS_COLORS = {
  in_progress: "#2D6A4F",
  en_route:    "#DE9A3C",
  assigned:    "#3eb39e",
  completed:   "#6B7280",
};

// Helper: build the staff map marker icon
function buildStaffIcon(initials, color) {
  const size = 44;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:4px solid white;
      box-shadow:0 2px 12px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:700;font-size:14px;
      font-family:'Inter',sans-serif;
      position:relative;
    ">
      ${initials}
      <div style="
        position:absolute;bottom:-2px;right:-2px;
        width:12px;height:12px;border-radius:50%;
        background:#22c55e;border:2px solid white;
      "></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

// Helper: patient destination marker
function buildPatientIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:#7C3AED;border:3px solid white;
      box-shadow:0 2px 10px rgba(124,58,237,0.45);
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:16px;
    ">🏠</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -22],
  });
}

// "Last updated X sec/min ago" ticker
function LastUpdatedTicker({ lastPingTs }) {
  const [ago, setAgo] = useState(0);
  useEffect(() => {
    if (!lastPingTs) return;
    const tick = () => setAgo(Math.floor((Date.now() - lastPingTs) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lastPingTs]);
  if (!lastPingTs)
    return (
      <span style={{ color: "var(--status-grey)", fontSize: "0.78rem" }}>
        Awaiting first ping…
      </span>
    );
  return (
    <span
      style={{
        fontSize: "0.78rem",
        color:
          ago < 15 ? "#22c55e" : ago < 60 ? "#DE9A3C" : "var(--status-grey)",
        fontWeight: 600,
      }}
    >
      {ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`}
    </span>
  );
}

// Map legend chip
function LegendChip({ color, label, dash }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        borderRadius: 6,
        padding: "3px 8px",
        fontSize: "0.68rem",
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 5,
        border: "1px solid rgba(0,0,0,0.08)",
        backdropFilter: "blur(4px)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 20,
          height: 2,
          background: dash ? "none" : color,
          borderTop: dash ? `2px dashed ${color}` : "none",
          borderRadius: 2,
        }}
      />
      {label}
    </div>
  );
}

// Embedded Leaflet map with trail + patient pin
function TrailMap({ visit, trail }) {
  const mapRef       = useRef(null);
  const mapInstance  = useRef(null);
  const staffMarker  = useRef(null);
  const patientMarker = useRef(null);
  const trailLine    = useRef(null);
  const connectLine  = useRef(null);

  // Mount the map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const defaultLat = visit.staff_lat || visit.patient_lat || 33.57;
    const defaultLng = visit.staff_lng || visit.patient_lng || 73.15;
    const map = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 15,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    mapInstance.current = map;
    return () => {
      map.remove();
      mapInstance.current = null;
      staffMarker.current = null;
      patientMarker.current = null;
      trailLine.current = null;
      connectLine.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update markers / polylines whenever trail or visit changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    const staffLat  = parseFloat(visit.staff_lat) || null;
    const staffLng  = parseFloat(visit.staff_lng) || null;
    const patLat    = parseFloat(visit.patient_lat) || null;
    const patLng    = parseFloat(visit.patient_lng) || null;
    const color     = STATUS_COLORS[visit.status] || "#6B7280";
    const initials  = (visit.staff_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2);

    // Staff marker
    if (staffLat && staffLng) {
      const icon = buildStaffIcon(initials, color);
      if (staffMarker.current) {
        staffMarker.current.setLatLng([staffLat, staffLng]);
        staffMarker.current.setIcon(icon);
      } else {
        staffMarker.current = L.marker([staffLat, staffLng], { icon })
          .bindPopup(`<strong>${visit.staff_name}</strong><br/>${visit.status_display || visit.status}`)
          .addTo(map);
      }
    }

    // Patient marker — cached, added once
    if (patLat && patLng && !patientMarker.current) {
      patientMarker.current = L.marker([patLat, patLng], {
        icon: buildPatientIcon(),
      })
        .bindPopup(`<strong>${visit.patient_name}</strong><br/>Patient location`)
        .addTo(map);
    }

    // Route trail polyline
    if (trail && trail.length >= 2) {
      const latlngs = trail.map((p) => [p.lat, p.lng]);
      if (trailLine.current) {
        trailLine.current.setLatLngs(latlngs);
      } else {
        trailLine.current = L.polyline(latlngs, {
          color,
          weight: 4,
          opacity: 0.8,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(map);
      }
    } else if (trailLine.current) {
      trailLine.current.setLatLngs([]);
    }

    // Dashed connecting line staff → patient
    if (staffLat && staffLng && patLat && patLng) {
      const pts = [
        [staffLat, staffLng],
        [patLat, patLng],
      ];
      if (connectLine.current) {
        connectLine.current.setLatLngs(pts);
      } else {
        connectLine.current = L.polyline(pts, {
          color: "#7C3AED",
          weight: 2,
          opacity: 0.55,
          dashArray: "6 8",
        }).addTo(map);
      }
    }

    // Auto-fit bounds
    const points = [];
    if (staffLat && staffLng)   points.push([staffLat, staffLng]);
    if (patLat && patLng)       points.push([patLat, patLng]);
    if (trail && trail.length > 0)
      trail.forEach((p) => points.push([p.lat, p.lng]));

    if (points.length === 1) {
      map.setView(points[0], 15);
    } else if (points.length >= 2) {
      try {
        map.fitBounds(L.latLngBounds(points), {
          padding: [30, 30],
          maxZoom: 16,
        });
      } catch (_) {}
    }
  }, [visit, trail]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: 280,
          borderRadius: 10,
          overflow: "hidden",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          pointerEvents: "none",
        }}
      >
        <LegendChip
          color={STATUS_COLORS[visit.status] || "#6B7280"}
          label="Staff"
        />
        {visit.patient_lat && visit.patient_lng && (
          <LegendChip color="#7C3AED" label="Patient" />
        )}
        {trail && trail.length >= 2 && (
          <LegendChip
            color={STATUS_COLORS[visit.status] || "#6B7280"}
            dash
            label="Trail"
          />
        )}
      </div>
    </div>
  );
}

// ── Main panel component ──────────────────────────────────────────────────────

export default function StaffProfilePanel({ visit, onClose }) {
  const staffTrails     = useStore((s) => s.staffTrails);
  const fetchStaffRoute = useStore((s) => s.fetchStaffRoute);

  const staffId = visit?.assigned_staff?.id || visit?.staff_id;
  const trail   = staffId ? staffTrails[staffId] || [] : [];

  // Seed historical route when panel opens
  useEffect(() => {
    if (staffId) fetchStaffRoute(staffId, 30);
  }, [staffId, fetchStaffRoute]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!visit) return null;

  const status     = visit.status || "assigned";
  const color      = STATUS_COLORS[status] || "#6B7280";
  const initials   = (visit.staff_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2);
  const roleLabel  = visit.assigned_staff?.role_display || visit.staff_role || "Field Staff";
  const hasPatGPS  = !!(visit.patient_lat && visit.patient_lng);
  const lastPingTs = trail.length > 0 ? trail[trail.length - 1].ts : null;

  return (
    <>
      {/* Semi-transparent backdrop */}
      <div className="staff-profile-backdrop" onClick={onClose} />

      {/* Slide-in panel */}
      <aside
        className="staff-profile-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${visit.staff_name} live profile`}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="sp-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 700,
                fontSize: 18,
                border: "3px solid white",
                boxShadow: `0 0 0 3px ${color}55`,
                flexShrink: 0,
                fontFamily: "'Inter',sans-serif",
              }}
            >
              {initials}
            </div>
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "1rem",
                  color: "#1a0a2e",
                  lineHeight: 1.2,
                }}
              >
                {visit.staff_name}
              </div>
              <div
                style={{
                  fontSize: "0.78rem",
                  color: "var(--status-grey)",
                  marginTop: 2,
                }}
              >
                {roleLabel}
              </div>
              <div style={{ marginTop: 5 }}>
                <span
                  className={`badge badge-${
                    status === "in_progress"
                      ? "green"
                      : status === "en_route"
                      ? "amber"
                      : "grey"
                  }`}
                  style={{ fontSize: "0.65rem" }}
                >
                  {visit.status_display || status}
                </span>
              </div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close staff profile"
            style={{ alignSelf: "flex-start", flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="sp-body">

          {/* Live status bar */}
          <div className="sp-status-bar">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                className="live-dot"
                style={{ display: "inline-block" }}
              />
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#1a0a2e",
                }}
              >
                Live tracking active
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Clock size={12} color="var(--status-grey)" />
              <LastUpdatedTicker lastPingTs={lastPingTs} />
            </div>
          </div>

          {/* Contact chips */}
          {(visit.phone || visit.employee_id) && (
            <div className="sp-info-grid">
              {visit.phone && (
                <a href={`tel:${visit.phone}`} className="sp-info-chip">
                  <Phone size={13} />
                  <span>{visit.phone}</span>
                </a>
              )}
              {visit.employee_id && (
                <div className="sp-info-chip">
                  <User size={13} />
                  <span>{visit.employee_id}</span>
                </div>
              )}
            </div>
          )}

          {/* Patient assignment card */}
          <div className="sp-section-label">Assigned Patient</div>
          <div className="sp-patient-card">
            <div
              style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "var(--sage-100)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <User size={16} color="var(--teal-700)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    color: "#1a0a2e",
                  }}
                >
                  {visit.patient_name || "—"}
                </div>
                {visit.patient_address && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--status-grey)",
                      marginTop: 2,
                      display: "flex",
                      gap: 4,
                      alignItems: "flex-start",
                    }}
                  >
                    <MapPin size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{visit.patient_address}</span>
                  </div>
                )}
                {!hasPatGPS && (
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "#DE9A3C",
                      marginTop: 4,
                      display: "flex",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    <Navigation size={11} />
                    <span>No GPS coordinates on file — patient pin not shown</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trail stats */}
          {trail.length > 0 && (
            <div className="sp-trail-stats">
              <div className="sp-trail-stat">
                <Activity size={13} color={color} />
                <span>
                  <strong>{trail.length}</strong> GPS pings in trail
                </span>
              </div>
              <div className="sp-trail-stat">
                <Navigation size={13} color={color} />
                <span>Showing last {Math.min(trail.length, 30)} positions</span>
              </div>
            </div>
          )}

          {/* ── Live map ──────────────────────────────────────────────────── */}
          <div className="sp-section-label" style={{ marginTop: 16 }}>
            Live Map
            <span
              style={{
                fontSize: "0.65rem",
                color: "var(--status-grey)",
                fontWeight: 400,
                marginLeft: 8,
              }}
            >
              Leaflet · OpenStreetMap
            </span>
          </div>
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid var(--sage-200)",
            }}
          >
            <TrailMap visit={visit} trail={trail} />
          </div>

          {/* Raw coordinates */}
          {visit.staff_lat && visit.staff_lng && (
            <div className="sp-coords">
              <span style={{ color: "var(--status-grey)" }}>Staff GPS</span>
              <span className="mono" style={{ fontSize: "0.73rem" }}>
                {Number(visit.staff_lat).toFixed(5)},{" "}
                {Number(visit.staff_lng).toFixed(5)}
              </span>
            </div>
          )}
          {hasPatGPS && (
            <div className="sp-coords">
              <span style={{ color: "var(--status-grey)" }}>Patient GPS</span>
              <span className="mono" style={{ fontSize: "0.73rem" }}>
                {Number(visit.patient_lat).toFixed(5)},{" "}
                {Number(visit.patient_lng).toFixed(5)}
              </span>
            </div>
          )}
        </div>
        {/* end sp-body */}
      </aside>
    </>
  );
}
