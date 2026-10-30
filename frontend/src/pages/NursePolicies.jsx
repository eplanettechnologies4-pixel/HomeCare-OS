import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, FileText, ChevronRight, X } from 'lucide-react';
import apiFetch from '../services/api';

export default function NursePolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/staff-portal/policies/');
      if (res.ok) {
        const json = await res.json();
        setPolicies(json.results || json || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  const handleAcknowledge = async (id) => {
    try {
      setAcknowledging(true);
      const res = await apiFetch(`/staff-portal/policies/${id}/acknowledge/`, {
        method: 'POST',
      });
      if (res.ok) {
        await loadPolicies();
        if (selectedPolicy?.id === id) {
          setSelectedPolicy((prev) => ({ ...prev, is_acknowledged: true }));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          Company Policies & Clinical Guidelines
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
          Standard operating procedures, clinical hygiene protocols, and mandatory staff acknowledgements.
        </p>
      </div>

      <div className="card" style={{ padding: 18, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center' }}><div className="spinner" /></div>
        ) : policies.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {policies.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '14px 16px',
                  background: 'var(--gray-50)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={16} style={{ color: p.is_acknowledged ? 'var(--success)' : 'var(--primary)' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{p.title}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', background: '#E5E7EB', padding: '1px 6px', borderRadius: 4 }}>
                      v{p.version}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
                    {p.summary || p.content?.slice(0, 120)}...
                  </div>
                  {p.is_acknowledged && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--success)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={12} /> Acknowledged by you
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setSelectedPolicy(p)}
                  >
                    Read Policy
                  </button>
                  {!p.is_acknowledged ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleAcknowledge(p.id)}
                      disabled={acknowledging}
                    >
                      I have read this
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)', background: 'var(--success-soft)', padding: '4px 10px', borderRadius: 'var(--radius-pill)' }}>
                      Completed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
            <p>No active policies published.</p>
          </div>
        )}
      </div>

      {selectedPolicy && (
        <div className="modal-backdrop" onClick={() => setSelectedPolicy(null)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>{selectedPolicy.title}</h3>
                <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: 2 }}>
                  Category: {selectedPolicy.category} • Version: {selectedPolicy.version}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedPolicy(null)}><X size={16} /></button>
            </div>

            <div style={{ fontSize: '0.86rem', lineHeight: 1.6, color: 'var(--text)', background: 'var(--gray-50)', padding: 16, borderRadius: 'var(--radius-md)', maxHeight: 280, overflowY: 'auto' }}>
              {selectedPolicy.content}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                {selectedPolicy.is_acknowledged ? '✓ You have acknowledged this policy' : 'Please read carefully before confirming.'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setSelectedPolicy(null)}>Close</button>
                {!selectedPolicy.is_acknowledged && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleAcknowledge(selectedPolicy.id)}
                    disabled={acknowledging}
                  >
                    I have read this
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
