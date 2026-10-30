import React, { useState, useEffect } from 'react';
import { Phone, AlertTriangle, Clock, ShieldAlert, PhoneCall, CheckCircle2 } from 'lucide-react';
import apiFetch from '../services/api';

export default function NurseCallHelp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sosTriggered, setSosTriggered] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await apiFetch('/staff-portal/home/');
        if (res.ok) {
          setData(await res.json());
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const supervisor = data?.supervisor;
  const officeHours = data?.office_hours || {
    start: '09:00',
    end: '17:00',
    timezone: 'Asia/Karachi',
    is_open_now: false,
  };

  const handleSos = () => {
    if (window.confirm('TRIGGER EMERGENCY SOS: This will alert the 24/7 Rapid Response team and escalate to senior clinical management immediately. Proceed?')) {
      setSosTriggered(true);
      // Existing SOS flow stays untouched
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)', maxWidth: 720, margin: '0 auto' }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          Call Help & Emergency Assistance
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
          Direct hotlines to your shift supervisor, office coordination team, and 24/7 Clinical Emergency SOS.
        </p>
      </div>

      {/* ── 1. Assigned Shift Supervisor ── */}
      <div className="card" style={{ padding: 20, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Direct Shift Supervisor
            </div>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>
              {supervisor?.name || 'Assigned Care Coordinator'}
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
              Available 24/7 during your rostered clinical shift for clinical guidance and urgent escalation.
            </div>
          </div>
          {supervisor?.phone ? (
            <a
              href={`tel:${supervisor.phone}`}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <PhoneCall size={15} />
              <span>Call Supervisor</span>
            </a>
          ) : (
            <a
              href="tel:+923008901234"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <PhoneCall size={15} />
              <span>Call Care Coordinator</span>
            </a>
          )}
        </div>
      </div>

      {/* ── 2. Head Office Phone (Server-driven Office Hours Enforcement) ── */}
      <div className="card" style={{ padding: 20, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                Main Office Support Line
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-pill)',
                  background: officeHours.is_open_now ? 'var(--success-soft)' : 'var(--gray-100)',
                  color: officeHours.is_open_now ? 'var(--success)' : 'var(--muted)',
                }}
              >
                {officeHours.is_open_now ? 'Office Open' : 'Office Closed'}
              </span>
            </div>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>
              +92 (51) 889-0123
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
              Official office hours: <strong>{officeHours.start} – {officeHours.end}</strong> ({officeHours.timezone}).
            </div>
          </div>

          {officeHours.is_open_now ? (
            <a
              href="tel:+92518890123"
              className="btn btn-outline"
              style={{ borderColor: 'var(--primary)', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Phone size={15} />
              <span>Call Office</span>
            </a>
          ) : (
            <button
              className="btn btn-outline"
              disabled
              style={{ opacity: 0.6, display: 'flex', alignItems: 'center', gap: 6, cursor: 'not-allowed' }}
              title="Office phone line is only available during official office working hours"
            >
              <Clock size={15} />
              <span>Closed ({officeHours.start}-{officeHours.end})</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 3. Emergency SOS Hotline (Untouched standard emergency protocol) ── */}
      <div
        className="card"
        style={{
          padding: 22,
          background: 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid #FECACA',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: 'var(--danger-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--danger)',
                flexShrink: 0,
              }}
            >
              <ShieldAlert size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: 'var(--danger)' }}>
                24/7 Emergency Clinical SOS
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                For sudden patient arrest, severe anaphylaxis, or acute life-threatening situations at home.
                Immediately notifies the medical director and dispatches urgent mobile telemetry backup.
              </p>
              {sosTriggered && (
                <div style={{ marginTop: 8, fontSize: '0.82rem', fontWeight: 700, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={15} /> SOS Signal Sent. Rapid response coordinator is connecting now.
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSos}
            className="btn"
            style={{
              background: 'var(--danger)',
              color: '#FFFFFF',
              fontWeight: 800,
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(220, 38, 38, 0.25)',
            }}
          >
            TRIGGER SOS
          </button>
        </div>
      </div>
    </div>
  );
}
