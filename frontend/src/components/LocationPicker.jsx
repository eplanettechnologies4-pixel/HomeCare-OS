import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { Search, MapPin, Navigation, Link as LinkIcon, Loader2, AlertCircle, Check } from 'lucide-react';
import { apiFetch } from '../services/api';

/**
 * Reusable LocationPicker Component
 *
 * Features:
 * - Leaflet map with interactive, draggable pin. Clicking moves the pin.
 * - Pakistan-scoped OpenStreetMap Nominatim address search (debounced 500ms).
 * - "Use my current location" browser geolocation button.
 * - "Paste Google Maps link" input resolving via server-side /api/locations/resolve-link/.
 * - Reverse geocode on pin move to auto-suggest address text (editable).
 * - Two-way sync: outputs { latitude, longitude, address }.
 */
export default function LocationPicker({
  latitude,
  longitude,
  address = '',
  onChange,
  height = 260,
  label = 'Patient Location & Address',
  required = true,
}) {
  // Ensure numeric coordinates or fallback to Islamabad center
  const initialLat = Number(latitude) || 33.6844;
  const initialLng = Number(longitude) || 73.0479;

  const [coords, setCoords] = useState({ lat: initialLat, lng: initialLng });
  const [addressText, setAddressText] = useState(address || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [linkInput, setLinkInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerInstanceRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const reverseDebounceRef = useRef(null);

  // Sync addressText if external prop changes
  useEffect(() => {
    if (address !== undefined && address !== addressText) {
      setAddressText(address);
    }
  }, [address]);

  // Sync coords if external lat/lng changes
  useEffect(() => {
    const nextLat = Number(latitude);
    const nextLng = Number(longitude);
    if (!isNaN(nextLat) && !isNaN(nextLng) && (nextLat !== coords.lat || nextLng !== coords.lng)) {
      setCoords({ lat: nextLat, lng: nextLng });
      if (markerInstanceRef.current) {
        markerInstanceRef.current.setLatLng([nextLat, nextLng]);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo([nextLat, nextLng]);
      }
    }
  }, [latitude, longitude]);

  // Helper: Reverse geocode coordinate pair to street address
  const performReverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.display_name || null;
    } catch (e) {
      console.warn('[LocationPicker] Reverse geocoding failed:', e);
      return null;
    }
  }, []);

  // Update position, trigger reverse geocode if requested, and notify parent
  const handlePositionUpdate = useCallback((lat, lng, doReverse = true) => {
    const formattedLat = Number(Number(lat).toFixed(6));
    const formattedLng = Number(Number(lng).toFixed(6));
    setCoords({ lat: formattedLat, lng: formattedLng });

    if (doReverse) {
      if (reverseDebounceRef.current) clearTimeout(reverseDebounceRef.current);
      reverseDebounceRef.current = setTimeout(async () => {
        const suggested = await performReverseGeocode(formattedLat, formattedLng);
        if (suggested) {
          setAddressText(suggested);
          onChange?.({ latitude: formattedLat, longitude: formattedLng, address: suggested });
          return;
        }
        onChange?.({ latitude: formattedLat, longitude: formattedLng, address: addressText });
      }, 300);
    } else {
      onChange?.({ latitude: formattedLat, longitude: formattedLng, address: addressText });
    }
  }, [performReverseGeocode, onChange, addressText]);

  // ── Leaflet Map Lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [coords.lat, coords.lng],
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Custom pulse pin icon
    const pinIcon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
          <div style="width:28px;height:28px;border-radius:50%;background:#611F8C;border:3px solid white;box-shadow:0 3px 10px rgba(97,31,140,0.45);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          </div>
          <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:6px;height:6px;background:#611F8C;border-radius:50%;"></div>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
    });

    const marker = L.marker([coords.lat, coords.lng], {
      icon: pinIcon,
      draggable: true,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      handlePositionUpdate(pos.lat, pos.lng, true);
    });

    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      handlePositionUpdate(e.latlng.lat, e.latlng.lng, true);
    });

    mapInstanceRef.current = map;
    markerInstanceRef.current = marker;

    // Invalidate size to handle modals rendering after mount
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Address Search using OpenStreetMap Nominatim (Debounced 500ms, PK only)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setIsSearching(true);

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            searchQuery.trim()
          )}&countrycodes=pk&limit=6&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (res.ok) {
          const list = await res.json();
          setSearchResults(Array.isArray(list) ? list : []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.warn('[LocationPicker] Address search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  const handleSelectSearchResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const selectedAddress = result.display_name;

    if (!isNaN(lat) && !isNaN(lng)) {
      setCoords({ lat, lng });
      setAddressText(selectedAddress);
      setSearchQuery('');
      setShowDropdown(false);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lng], 16);
      }
      if (markerInstanceRef.current) {
        markerInstanceRef.current.setLatLng([lat, lng]);
      }

      onChange?.({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), address: selectedAddress });
    }
  };

  // ── Browser Geolocation ("Use my current location") ────────────────────────
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLinkError('Browser geolocation is not supported.');
      return;
    }
    setIsLocating(true);
    setLinkError('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsLocating(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        setCoords({ lat, lng });
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 16);
        }
        if (markerInstanceRef.current) {
          markerInstanceRef.current.setLatLng([lat, lng]);
        }

        const suggested = await performReverseGeocode(lat, lng);
        const finalAddr = suggested || addressText;
        setAddressText(finalAddr);
        onChange?.({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), address: finalAddr });
      },
      (err) => {
        setIsLocating(false);
        setLinkError(`Geolocation error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // ── Paste Google Maps Link Resolver (via backend SSRF-safe endpoint) ────────
  const handleResolveLink = async (e) => {
    if (e) e.preventDefault();
    if (!linkInput.trim()) return;

    setIsResolving(true);
    setLinkError('');

    try {
      const res = await apiFetch('/locations/resolve-link/', {
        method: 'POST',
        body: JSON.stringify({ url: linkInput.trim() }),
      });

      if (res && res.latitude !== undefined && res.longitude !== undefined) {
        const lat = parseFloat(res.latitude);
        const lng = parseFloat(res.longitude);

        setCoords({ lat, lng });
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 16);
        }
        if (markerInstanceRef.current) {
          markerInstanceRef.current.setLatLng([lat, lng]);
        }

        const suggested = await performReverseGeocode(lat, lng);
        const finalAddr = suggested || addressText;
        setAddressText(finalAddr);
        setLinkInput('');

        onChange?.({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), address: finalAddr });
      } else {
        setLinkError(res?.error || 'Could not resolve location coordinates from this link.');
      }
    } catch (err) {
      setLinkError(err.message || 'Failed to resolve location link.');
    } finally {
      setIsResolving(false);
    }
  };

  // ── Manual Address Text Input ──────────────────────────────────────────────
  const handleAddressTextChange = (e) => {
    const val = e.target.value;
    setAddressText(val);
    onChange?.({ latitude: coords.lat, longitude: coords.lng, address: val });
  };

  return (
    <div className="location-picker-container" style={{ marginBottom: 16 }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
            {label} {required && <span style={{ color: 'var(--status-red, #dc2626)' }}>*</span>}
          </label>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
            GPS: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </div>
        </div>
      )}

      {/* ── Toolbar: Address Search + Link Input + Current Location ────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
          {/* Nominatim Search Input */}
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Search area, street or landmark in Pakistan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              style={{ paddingLeft: 32, fontSize: '0.82rem' }}
            />
            {isSearching && (
              <Loader2
                size={14}
                className="spin"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#611F8C' }}
              />
            )}
          </div>

          {/* Current Location Button */}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleCurrentLocation}
            disabled={isLocating}
            title="Use my current GPS location"
            style={{ padding: '0 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
          >
            {isLocating ? <Loader2 size={13} className="spin" /> : <Navigation size={13} color="#611F8C" />}
            <span>GPS</span>
          </button>
        </div>

        {/* Nominatim Search Dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div
            style={{
              position: 'relative',
              background: 'white',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              maxHeight: 180,
              overflowY: 'auto',
              zIndex: 1000,
              marginTop: -4,
            }}
          >
            {searchResults.map((r) => (
              <div
                key={r.place_id}
                onClick={() => handleSelectSearchResult(r)}
                style={{
                  padding: '7px 10px',
                  fontSize: '0.78rem',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
              >
                <MapPin size={13} color="#611F8C" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.display_name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Google Maps Link Paste Box */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <LinkIcon
              size={14}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Paste Google Maps link (maps.app.goo.gl/...) or raw lat,lng..."
              value={linkInput}
              onChange={(e) => {
                setLinkInput(e.target.value);
                setLinkError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleResolveLink();
                }
              }}
              style={{ paddingLeft: 30, fontSize: '0.8rem', height: 32 }}
            />
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleResolveLink}
            disabled={isResolving || !linkInput.trim()}
            style={{
              background: '#611F8C',
              color: 'white',
              fontSize: '0.78rem',
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {isResolving ? <Loader2 size={12} className="spin" /> : 'Pin'}
          </button>
        </div>

        {linkError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.75rem',
              color: '#b91c1c',
              background: '#fef2f2',
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid #fecaca',
            }}
          >
            <AlertCircle size={13} />
            <span>{linkError}</span>
          </div>
        )}
      </div>

      {/* ── Leaflet Interactive Map ────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
          marginBottom: 8,
        }}
      >
        <div
          ref={mapContainerRef}
          style={{
            height: height,
            width: '100%',
            background: '#f1f5f9',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: 6,
            zIndex: 400,
            background: 'rgba(255,255,255,0.92)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: '0.68rem',
            color: '#475569',
            pointerEvents: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          Click map or drag pin to adjust destination
        </div>
      </div>

      {/* ── Editable Address Text Field ────────────────────────────────────── */}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: '0.76rem', color: '#64748b', marginBottom: 2 }}>
          Address Text (Auto-filled on pin move, editable for apartment/floor details):
        </label>
        <textarea
          className="form-textarea"
          rows={2}
          value={addressText}
          onChange={handleAddressTextChange}
          placeholder="Complete street address, house/flat number, sector, city..."
          required={required}
          style={{ fontSize: '0.82rem', resize: 'vertical' }}
        />
      </div>
    </div>
  );
}
