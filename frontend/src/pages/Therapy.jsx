import React, { useState } from 'react';
import { THERAPY_SESSIONS } from '../data/mockData';
import { format } from 'date-fns';

const DISCIPLINES = [
  { key: 'physio',        label: 'Physiotherapy',                color: '#611F8C', icon: '🦿' },
  { key: 'speech',        label: 'Speech & Language Therapy',     color: '#7529a7', icon: '🗣️' },
  { key: 'psychotherapy', label: 'Psychotherapy',                color: '#441365', icon: '🧠' },
  { key: 'dietician',     label: 'Dietician',                    color: '#b87320', icon: '🥗' },
];

const STATUS_BADGE = {
  completed:  'badge-grey',
  scheduled:  'badge-teal',
  in_progress:'badge-green',
  cancelled:  'badge-red',
};

function SessionCard({ session }) {
  return (
    <div style={{
      padding: 14, borderRadius: 10,
      border: `1px solid var(--sage-200)`,
      background: session.status === 'in_progress' ? 'var(--sage-50)' : 'white',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-800)' }}>{session.patient_name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)' }}>{session.mr_number} · Therapist: {session.therapist}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={`badge ${STATUS_BADGE[session.status]}`} style={{ fontSize: '0.68rem' }}>{session.status}</span>
          <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', marginTop: 3 }}>Session {session.session_number}/{session.total_sessions}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: '#4b5563', marginBottom: 8 }}>
        <span>🕐 {session.time}</span>
        <span>⏱ {session.duration_mins} min</span>
      </div>
      <div style={{ background: 'var(--sage-50)', borderRadius: 6, padding: '8px 10px', fontSize: '0.8rem' }}>
        <div style={{ fontWeight: 600, color: 'var(--teal-700)', marginBottom: 2 }}>Goal: {session.goals}</div>
        <div style={{ color: '#4b5563', lineHeight: 1.5 }}>{session.notes}</div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--status-grey)', marginBottom: 4 }}>
          <span>Progress</span>
          <span>{session.session_number}/{session.total_sessions}</span>
        </div>
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${(session.session_number/session.total_sessions)*100}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function Therapy() {
  const [activeDisc, setActiveDisc] = useState('physio');
  const sessions = THERAPY_SESSIONS[activeDisc] || [];

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Therapy Services</h1>
          <p className="page-subtitle">Session schedules and clinical notes for all therapy disciplines</p>
        </div>
      </div>

      {/* Discipline tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {DISCIPLINES.map(d => (
          <button
            key={d.key}
            onClick={() => setActiveDisc(d.key)}
            style={{
              padding: '14px 16px', borderRadius: 'var(--radius-md)',
              border: `2px solid ${activeDisc === d.key ? d.color : 'var(--sage-200)'}`,
              background: activeDisc === d.key ? d.color + '12' : 'white',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{d.icon}</div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: activeDisc===d.key ? d.color : 'var(--teal-800)' }}>{d.label}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginTop: 2 }}>
              {(THERAPY_SESSIONS[d.key]||[]).length} sessions today
            </div>
          </button>
        ))}
      </div>

      {/* Today's schedule */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                {DISCIPLINES.find(d=>d.key===activeDisc)?.icon}{' '}
                {DISCIPLINES.find(d=>d.key===activeDisc)?.label} — Today
              </h3>
              <span className="badge badge-teal">{sessions.length} sessions</span>
            </div>
            <div className="card-body">
              {sessions.length === 0 ? (
                <p style={{ color: 'var(--status-grey)', textAlign: 'center', padding: '20px 0' }}>No sessions scheduled today</p>
              ) : (
                sessions.map(s => <SessionCard key={s.id} session={s} />)
              )}
            </div>
          </div>
        </div>

        {/* Stats sidebar */}
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)', marginBottom: 12 }}>Today's Summary</div>
            {DISCIPLINES.map(d => {
              const s = THERAPY_SESSIONS[d.key] || [];
              return (
                <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--sage-100)' }}>
                  <span style={{ fontSize: '0.85rem' }}>{d.icon} {d.label.split(' ')[0]}</span>
                  <span className="badge badge-teal" style={{ fontSize: '0.68rem' }}>{s.length}</span>
                </div>
              );
            })}
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)', marginBottom: 12 }}>Session Notes</div>
            <textarea className="form-textarea" placeholder="Add session notes for selected patient…" rows={6} />
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }}>Save Notes</button>
          </div>
        </div>
      </div>
    </div>
  );
}
