import React, { useState, useEffect } from 'react';
import { X, User, Clock, AlertTriangle, FileText, CheckCircle, ChevronRight, Pill, Activity, ShieldAlert } from 'lucide-react';
import apiFetch from '../services/api';
import { getTierChipConfig } from '../utils/rosterHelpers';
import { getAllergyInfo } from '../utils/allergyHelpers';

export default function NurseDrawer({
  isOpen,
  onClose,
  type = 'patients_today',
  title = "Today's Work",
  onPatientSelect,
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setData([]);
      setError(null);
      return;
    }

    const fetchItems = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/staff-portal/nurse-work-list/?type=${type}`);
        if (!res.ok) {
          throw new Error(`Failed to load data (${res.status})`);
        }
        const json = await res.json();
        setData(json.results || []);
      } catch (err) {
        console.error('Nurse drawer fetch error:', err);
        setError(err.message || 'Error loading clinical records');
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [isOpen, type]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          height: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '-4px 0 25px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #FAF5FF 0%, #F5F3FF 100%)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1E1B4B' }}>{title}</h3>
            <span style={{ fontSize: '12px', color: '#6D28D9', fontWeight: 600 }}>
              {loading ? 'Refreshing...' : `${data.length} item${data.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', borderRadius: '8px', color: '#64748B' }}
            aria-label="Close Drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <span style={{ fontSize: '13px' }}>Loading records...</span>
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {!loading && !error && data.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94A3B8' }}>
              <CheckCircle size={36} style={{ margin: '0 auto 12px', color: '#10B981', opacity: 0.8 }} />
              <div style={{ fontWeight: 600, color: '#334155', fontSize: '14px' }}>No items found</div>
              <div style={{ fontSize: '12px', marginTop: 4 }}>All records for this category are up to date.</div>
            </div>
          )}

          {!loading && !error && data.map((item, idx) => {
            const patientId = item.patient_id || item.id;
            const patientName = item.patient_name || item.name || 'Patient';
            const mrNumber = item.mr_number || '-';

            return (
              <div
                key={item.id || item.booking_id || `${patientId}-${idx}`}
                onClick={() => {
                  if (onPatientSelect && patientId) {
                    onPatientSelect(patientId, item);
                  }
                }}
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  cursor: patientId ? 'pointer' : 'default',
                  transition: 'border-color 150ms ease, box-shadow 150ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
                className="hover:border-purple-300 hover:shadow-sm"
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>{patientName}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '1px 6px', borderRadius: '4px' }}>
                      MR: {mrNumber}
                    </span>
                    {item.latest_tier && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: '6px',
                          background: getTierChipConfig(item.latest_tier).bg,
                          color: getTierChipConfig(item.latest_tier).color,
                          border: `1px solid ${getTierChipConfig(item.latest_tier).border}`,
                        }}
                      >
                        {getTierChipConfig(item.latest_tier).label}
                      </span>
                    )}
                  </div>

                  {/* Contextual row depending on type */}
                  {type === 'patients_today' && (
                    <div style={{ fontSize: '12px', color: '#475569', marginTop: 4 }}>
                      <div><strong>Diagnosis:</strong> {item.primary_diagnosis || '-'}</div>
                      <div style={{ marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span>Service: {item.service_type || 'Bedside Care'}</span>
                        {item.allergy_status && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: getAllergyInfo(item.allergy_status, item.allergies).status === 'has_allergies' ? '#FEE2E2' : (item.allergy_status === 'nkda' ? '#ECFDF5' : '#FEF3C7'),
                              color: getAllergyInfo(item.allergy_status, item.allergies).status === 'has_allergies' ? '#991B1B' : (item.allergy_status === 'nkda' ? '#065F46' : '#92400E'),
                            }}
                          >
                            {getAllergyInfo(item.allergy_status, item.allergies).label}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {type === 'vitals_overdue' && (
                    <div style={{ fontSize: '12px', color: '#DC2626', marginTop: 4, fontWeight: 600 }}>
                      ⚠ Vitals overdue by {item.hours_overdue ? `${item.hours_overdue}h` : 'shift window'}
                      {item.last_recorded_at && (
                        <span style={{ color: '#64748B', fontWeight: 400, marginLeft: 6 }}>
                          (Last: {new Date(item.last_recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      )}
                    </div>
                  )}

                  {type === 'active_medications' && (
                    <div style={{ fontSize: '12px', color: '#334155', marginTop: 4 }}>
                      <div style={{ fontWeight: 600, color: '#0369A1' }}>💊 {item.medication} {item.dosage} ({item.route})</div>
                      <div style={{ color: '#64748B', marginTop: 2 }}>
                        Freq: {item.frequency || 'Per Rx'}
                        {item.last_administered_at && (
                          <span style={{ marginLeft: 6 }}>
                            • Last given: {new Date(item.last_administered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {type === 'pending_verification' && (
                    <div style={{ fontSize: '12px', color: '#B45309', marginTop: 4 }}>
                      <div style={{ fontWeight: 600 }}>Transcribed: {item.medication} {item.dosage}</div>
                      <div style={{ color: '#64748B', marginTop: 2 }}>Awaiting doctor/pharmacist verification</div>
                    </div>
                  )}

                  {type === 'pending_notes' && (
                    <div style={{ fontSize: '12px', color: '#D97706', marginTop: 4, fontWeight: 600 }}>
                      🕒 Shift active for {item.hours_elapsed || 2}+ hours without a nursing note
                    </div>
                  )}

                  {type === 'alerts' && (
                    <div style={{ fontSize: '12px', color: item.severity === 'high' ? '#DC2626' : '#B45309', marginTop: 4 }}>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      {item.created_at && (
                        <div style={{ color: '#64748B', marginTop: 2 }}>
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {patientId && (
                  <ChevronRight size={16} style={{ color: '#94A3B8', flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

