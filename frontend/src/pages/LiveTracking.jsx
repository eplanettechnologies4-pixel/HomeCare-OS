import React, { useState, useEffect, useRef } from 'react';
import { Map, List, Settings, AlertTriangle, CheckCircle, Truck, Activity, Clock, X, Shield, Phone, Radio, Play, Square } from 'lucide-react';
import useStore from '../store/useStore';
import { useMockGPS } from '../hooks/useMockGPS';
import { useWebSocketTracking } from '../hooks/useWebSocketTracking';
import { GEOFENCE_EVENTS } from '../data/mockData';
import { format, formatDistanceToNow } from 'date-fns';
import MiniMap from '../components/MiniMap';

// ── Visit Status Pipeline ────────────────────────────────────────────────────
const STATUS_PIPELINE = ['assigned', 'en_route', 'in_progress', 'completed'];
const STATUS_LABELS = {
  assigned:    'Assigned',
  en_route:    'En Route',
  in_progress: 'In Progress',
  completed:   'Completed',
};
const STATUS_COLORS = {
  assigned:    'var(--status-grey)',
  en_route:    'var(--amber-500)',
  in_progress: 'var(--status-green)',
  completed:   'var(--status-grey)',
};

function StatusPipeline({ currentStatus }) {
  const currentIdx = STATUS_PIPELINE.indexOf(currentStatus);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '12px 0' }}>
      {STATUS_PIPELINE.map((s, i) => {
        const done    = i < currentIdx;
        const active  = i === currentIdx;
        const pending = i > currentIdx;
        return (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? 'var(--teal-400)' : active ? STATUS_COLORS[s] : 'var(--sage-200)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: (done || active) ? 'white' : '#9ca3af',
                fontSize: 12, fontWeight: 700,
                boxShadow: active ? `0 0 0 4px ${STATUS_COLORS[s]}33` : 'none',
                transition: 'all 0.3s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '0.65rem', fontWeight: active ? 700 : 400, color: active ? STATUS_COLORS[s] : '#9ca3af', whiteSpace: 'nowrap' }}>
                {STATUS_LABELS[s]}
              </span>
            </div>
            {i < STATUS_PIPELINE.length - 1 && (
              <div style={{ flex: 2, height: 2, background: done ? 'var(--teal-300)' : 'var(--sage-200)', marginBottom: 20, transition: 'background 0.3s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Countdown Hook ────────────────────────────────────────────────────────────
function useCountdown(targetISO) {
  const [display, setDisplay] = useState('');
  const [urgent, setUrgent]   = useState(false);
  useEffect(() => {
    if (!targetISO) return;
    const tick = () => {
      const diff = new Date(targetISO) - new Date();
      setUrgent(diff < 120000);
      if (diff <= 0) { setDisplay('OVERDUE'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDisplay(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [targetISO]);
  return { display, urgent };
}

// ── Alert Rules Panel ─────────────────────────────────────────────────────────
function AlertRulesPanel({ rules, onSave, onClose }) {
  const [local, setLocal] = useState({ ...rules });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-700)', margin: 0, fontSize: '1rem' }}>Alert Rule Thresholds</h3>
        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
      </div>
      {[
        { key: 'late_arrival_minutes', label: 'Late Arrival (min)', desc: 'Minutes after scheduled time before flagging as late' },
        { key: 'no_show_minutes',      label: 'No-Show (min)',     desc: 'Minutes after scheduled time before flagging as no-show' },
        { key: 'overstay_minutes',     label: 'Overstay (min)',    desc: 'Minutes past expected duration before flagging overstay' },
      ].map(({ key, label, desc }) => (
        <div key={key} className="form-group">
          <label className="form-label">{label}</label>
          <input
            type="number"
            className="form-input"
            value={local[key] ?? 15}
            onChange={(e) => setLocal({ ...local, [key]: Number(e.target.value) })}
            min={1} max={240}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginTop: 4 }}>{desc}</p>
        </div>
      ))}
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving to Server...' : 'Save Alert Rules'}
      </button>
    </div>
  );
}

// ── Visit Detail Card ─────────────────────────────────────────────────────────
function VisitCard({ visit, onClose }) {
  const { display: eta, urgent } = useCountdown(visit.status === 'en_route' ? visit.scheduled_time : null);
  if (!visit) return null;
  return (
    <div className="card" style={{ width: 320, position: 'absolute', top: 16, right: 16, zIndex: 500, boxShadow: 'var(--shadow-modal)' }}>
      <div className="drawer-header" style={{ padding: '14px 16px', position: 'relative' }}>
        <div className="avatar" style={{ background: 'var(--teal-200)' }}>
          {(visit.staff_name || '?').split(' ').map(n=>n[0]).join('')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-800)' }}>{visit.staff_name || '—'}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)' }}>{visit.assigned_staff?.role_display || visit.staff_role || 'Staff'}</div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={14} /></button>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--status-grey)' }}>Patient</span>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{visit.patient_name}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--status-grey)' }}>Service</span>
          <span className="badge badge-teal" style={{ fontSize: '0.7rem' }}>{visit.service_type_display}</span>
        </div>
        {visit.status === 'en_route' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--status-grey)' }}>Arrives in</span>
            <span className={`countdown${urgent ? ' urgent' : ''}`}>{eta}</span>
          </div>
        )}
        <StatusPipeline currentStatus={visit.status} />
        <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Scheduled</span>
            <span className="ts">{visit.scheduled_time ? format(new Date(visit.scheduled_time), 'HH:mm') : '—'}</span>
          </div>
          {visit.actual_start_time && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span>Started</span>
              <span className="ts">{format(new Date(visit.actual_start_time), 'HH:mm')}</span>
            </div>
          )}
          {visit.current_latitude && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span>GPS Lat/Lng</span>
              <span className="ts">{Number(visit.current_latitude).toFixed(4)}, {Number(visit.current_longitude).toFixed(4)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1, gap: 6 }}><Phone size={13} /> Contact</button>
          <button className="btn btn-amber btn-sm" style={{ flex: 1 }}>View Booking</button>
        </div>
      </div>
    </div>
  );
}

// ── List Row ──────────────────────────────────────────────────────────────────
function LiveVisitRow({ visit, isSelected, onClick }) {
  const { display: cd, urgent } = useCountdown(visit.status === 'en_route' ? visit.scheduled_time : null);
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', cursor: 'pointer',
        background: isSelected ? 'var(--sage-50)' : 'white',
        borderBottom: '1px solid var(--sage-100)',
        transition: 'background 0.15s',
      }}
    >
      <div className="avatar">{(visit.staff_name||'?').split(' ').map(n=>n[0]).join('')}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1a2e2b' }}>{visit.staff_name}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>{visit.patient_name}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <span className={`badge badge-${visit.status==='in_progress'?'green':visit.status==='en_route'?'amber':'grey'}`} style={{ fontSize: '0.68rem' }}>
          {visit.status_display}
        </span>
        {visit.status === 'en_route' && (
          <div className={`countdown${urgent?' urgent':''}`} style={{ marginTop: 3, fontSize: '0.75rem' }}>{cd}</div>
        )}
        {visit.status === 'in_progress' && visit.actual_start_time && (
          <div className="ts" style={{ marginTop: 3 }}>{formatDistanceToNow(new Date(visit.actual_start_time), { addSuffix: false })} in</div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LiveTracking() {
  // B1: Disable useMockGPS by default; only run behind explicit Simulation Mode toggle
  const [simulationMode, setSimulationMode] = useState(false);
  useMockGPS(simulationMode);

  // B1: Wire real-time WebSocket channel for instant deltas
  const userToken       = useStore((s) => s.userToken);
  useWebSocketTracking(userToken);

  const liveVisits      = useStore((s) => s.liveVisits);
  const fetchLiveVisits = useStore((s) => s.fetchLiveVisits);
  const sosEvents       = useStore((s) => s.sosEvents);
  const activeSosAlerts = useStore((s) => s.activeSosAlerts);
  const fetchActiveSOS  = useStore((s) => s.fetchActiveSOS);
  const resolveSOSAlert = useStore((s) => s.resolveSOSAlert);
  const alertRules      = useStore((s) => s.alertRules);
  const fetchAlertRules = useStore((s) => s.fetchAlertRules);
  const saveAlertRules  = useStore((s) => s.saveAlertRules);
  const geofenceEvents  = useStore((s) => s.geofenceEvents);

  const [view, setView]               = useState('map'); // 'map' | 'list'
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [showRules, setShowRules]     = useState(false);
  const [activeTab, setActiveTab]     = useState('visits'); // 'visits' | 'geofence' | 'sos'

  // B2: Initial page load — REST for snapshot, WebSocket for deltas
  useEffect(() => {
    fetchLiveVisits();
    fetchAlertRules();
    fetchActiveSOS();
  }, [fetchLiveVisits, fetchAlertRules, fetchActiveSOS]);

  // Combine active alerts from store
  const activeSOS = (activeSosAlerts && activeSosAlerts.length > 0)
    ? activeSosAlerts
    : sosEvents.filter((s) => s.status === 'active');

  const handleResolveSOS = (sosId) => {
    const notes = window.prompt('Enter resolution notes for this emergency alert:', 'Care coordinator contacted field staff and resolved incident.');
    if (notes !== null) {
      resolveSOSAlert(sosId, notes);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-h) - 28px)', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── B1 & B4: Pulsating Emergency Red SOS Banner ──────────────────── */}
      {activeSOS.length > 0 && (
        <div className="sos-banner-pulsating">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="sos-badge" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
              <AlertTriangle size={16} /> CRITICAL SOS ALERT ({activeSOS.length})
            </div>
            <div style={{ color: '#991b1b', fontSize: '0.875rem' }}>
              <strong>{activeSOS[0].staff_name || 'Field Staff'}</strong> triggered an emergency panic alert for patient <strong>{activeSOS[0].patient_name || 'Patient'}</strong>.
              {(activeSOS[0].latitude || activeSOS[0].lat) && (
                <span style={{ marginLeft: 8, opacity: 0.85 }}>
                  (GPS: {Number(activeSOS[0].latitude || activeSOS[0].lat).toFixed(4)}, {Number(activeSOS[0].longitude || activeSOS[0].lng).toFixed(4)})
                </span>
              )}
            </div>
          </div>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => handleResolveSOS(activeSOS[0].id || activeSOS[0].sos_id)}
          >
            Resolve Emergency
          </button>
        </div>
      )}

      {/* ── Top controls ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Live Tracking</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--status-grey)' }}>
            <span className="live-dot" style={{ display: 'inline-block', marginRight: 6 }} />
            {liveVisits.length} active visits · {simulationMode ? 'Simulated GPS feed active' : 'Real-time WebSocket & REST sync active'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* B1: Simulation Mode Toggle (Default: OFF) */}
          <button
            className={`simulation-toggle ${simulationMode ? 'active' : ''}`}
            onClick={() => setSimulationMode(!simulationMode)}
            title="Toggle mock GPS drift for demonstrations"
          >
            <Radio size={14} color={simulationMode ? '#b45309' : '#64748b'} />
            Simulation Mode: {simulationMode ? 'ON' : 'OFF'}
          </button>

          {activeSOS.length > 0 && (
            <div className="sos-badge"><AlertTriangle size={12} /> SOS ACTIVE ({activeSOS.length})</div>
          )}
          <button
            className={`btn ${view === 'map' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('map')}
          ><Map size={15} /> Map</button>
          <button
            className={`btn ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('list')}
          ><List size={15} /> List</button>
          <button className="btn btn-ghost" onClick={() => setShowRules(!showRules)}>
            <Settings size={15} /> Alert Rules
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>

        {/* ── Map / List View ───────────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', minHeight: 400 }}>
          {view === 'map' ? (
            <>
              <MiniMap visits={liveVisits} height="100%" fullScreen />
              {selectedVisit && (
                <VisitCard visit={selectedVisit} onClose={() => setSelectedVisit(null)} />
              )}
            </>
          ) : (
            <div className="card" style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <h3 className="card-title">Active Visits</h3>
                <span className="badge badge-green">{liveVisits.length} live</span>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {liveVisits.map((v) => (
                  <LiveVisitRow
                    key={v.id}
                    visit={v}
                    isSelected={selectedVisit?.id === v.id}
                    onClick={() => setSelectedVisit(selectedVisit?.id === v.id ? null : v)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel ───────────────────────────────────────────────── */}
        <div style={{ width: showRules ? 340 : 320, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>

          {/* Alert Rules Panel */}
          {showRules && (
            <div className="card">
              <AlertRulesPanel
                rules={alertRules}
                onSave={async (r) => {
                  await saveAlertRules(r);
                  setShowRules(false);
                }}
                onClose={() => setShowRules(false)}
              />
            </div>
          )}

          {/* Tabs: SOS / Geofence Events */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="tabs-bar" style={{ padding: '0 12px', marginBottom: 0 }}>
              {[
                { key: 'visits',   label: `Visits (${liveVisits.length})` },
                { key: 'geofence', label: 'Geofence Log' },
                { key: 'sos',      label: `SOS (${activeSOS.length})` },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`tab-item${activeTab === key ? ' active' : ''}`}
                  onClick={() => setActiveTab(key)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {key === 'sos' && activeSOS.length > 0
                    ? <span style={{ color: 'var(--status-red)', fontWeight: 700 }}>{label}</span>
                    : label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>

              {/* ── Visits Tab ────────────────────────────────────────── */}
              {activeTab === 'visits' && liveVisits.map((v) => (
                <div
                  key={v.id}
                  onClick={() => setSelectedVisit(selectedVisit?.id === v.id ? null : v)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    background: selectedVisit?.id === v.id ? 'var(--sage-50)' : 'white',
                    borderBottom: '1px solid var(--sage-100)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{v.staff_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)' }}>→ {v.patient_name}</div>
                    </div>
                    <span className={`badge badge-${v.status==='in_progress'?'green':v.status==='en_route'?'amber':'grey'}`} style={{ fontSize: '0.67rem' }}>
                      {v.status_display}
                    </span>
                  </div>
                  <StatusPipeline currentStatus={v.status} />
                </div>
              ))}

              {/* ── Geofence Log ──────────────────────────────────────── */}
              {activeTab === 'geofence' && (
                <table className="data-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Event</th>
                      <th>Time</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geofenceEvents.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{e.staff_name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--status-grey)' }}>{e.patient_name}</div>
                        </td>
                        <td>
                          <span className={`badge badge-${e.event_type==='check_in'?'green':e.event_type==='check_out'?'grey':'amber'}`} style={{ fontSize: '0.67rem' }}>
                            {e.event_type_display || e.event_type}
                          </span>
                        </td>
                        <td className="ts">{e.timestamp ? format(new Date(e.timestamp), 'HH:mm:ss') : '—'}</td>
                        <td className="ts">{e.visit_duration_minutes != null ? `${e.visit_duration_minutes} min` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ── SOS Log ───────────────────────────────────────────── */}
              {activeTab === 'sos' && (
                <div style={{ padding: 8 }}>
                  {sosEvents.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--status-grey)' }}>
                      <Shield size={24} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                      No SOS events
                    </div>
                  )}
                  {sosEvents.map((sos) => {
                    const isActive = sos.status === 'active';
                    return (
                      <div key={sos.id} style={{
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${isActive ? 'var(--status-red)' : 'var(--sage-200)'}`,
                        padding: 12, marginBottom: 8,
                        background: isActive ? '#fff5f5' : 'white',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, color: isActive ? 'var(--status-red)' : 'var(--status-grey)', fontSize: '0.85rem' }}>
                            {isActive ? '🚨 SOS ACTIVE' : '✓ Resolved'}
                          </span>
                          {isActive && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleResolveSOS(sos.id)}>
                              Resolve
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem' }}>
                          <div><strong>Staff:</strong> {sos.staff_name || 'Staff'}</div>
                          <div><strong>Patient:</strong> {sos.patient_name || 'Patient'}</div>
                          {(sos.latitude || sos.lat) && (
                            <div className="ts" style={{ marginTop: 4 }}>
                              GPS: {Number(sos.latitude || sos.lat).toFixed(4)}, {Number(sos.longitude || sos.lng).toFixed(4)}
                            </div>
                          )}
                          <div className="ts">{sos.triggered_at || sos.timestamp ? format(new Date(sos.triggered_at || sos.timestamp), 'HH:mm:ss dd MMM') : '—'}</div>
                          {sos.notes && (
                            <div style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--status-grey)' }}>
                              Notes: {sos.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
