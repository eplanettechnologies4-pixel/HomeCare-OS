import React, { useState, useEffect } from 'react';
import { X, User, Clock, AlertTriangle, FileText, CheckCircle, ChevronRight, Stethoscope, Pill, MapPin } from 'lucide-react';
import { getTierChipConfig } from '../utils/rosterHelpers';

export default function DoctorDrawer({
  isOpen,
  onClose,
  type = 'consultations', // 'consultations' | 'pending_requests' | 'patients_by_tier'
  filterParam = '',
  title = 'Clinical Details',
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

    const fetchDrawerData = async () => {
      setLoading(true);
      setError(null);
      try {
        let url = '';
        if (type === 'consultations') {
          url = `/api/staff-portal/consultations-list/?filter=${filterParam || 'today'}`;
        } else if (type === 'pending_requests') {
          url = `/api/staff-portal/pending-requests-list/?type=${filterParam || 'all'}`;
        } else if (type === 'patients_by_tier') {
          url = `/api/staff-portal/patients-by-tier/?tier=${filterParam || 'critical'}`;
        }

        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) {
          throw new Error(`Failed to load data (${res.status})`);
        }
        const json = await res.json();
        setData(json.results || []);
      } catch (err) {
        console.error('Drawer fetch error:', err);
        setError(err.message || 'Error loading clinical records');
      } finally {
        setLoading(false);
      }
    };

    fetchDrawerData();
  }, [isOpen, type, filterParam]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#FFFFFF',
          height: '100%',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #FAF5FF 0%, #FFFFFF 100%)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1E1B4B' }}>
              {title}
            </h3>
            <span style={{ fontSize: '12px', color: '#6D28D9', fontWeight: 600 }}>
              {data.length} {data.length === 1 ? 'record' : 'records'} found
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ width: 32, height: 32, padding: 0, borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#6D28D9', fontSize: '13px' }}>
              Loading assigned patient records...
            </div>
          )}

          {error && (
            <div style={{ padding: '14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, color: '#DC2626', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {!loading && !error && data.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: '13px' }}>
              No items in this category.
            </div>
          )}

          {!loading && !error && data.map((item, idx) => {
            // 1. Consultations Item
            if (type === 'consultations') {
              return (
                <div
                  key={item.id || idx}
                  onClick={() => onPatientSelect && onPatientSelect(item.patient_id, { bookingId: item.id })}
                  style={{
                    background: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.background = '#FAF5FF'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#F9FAFB'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#1E1B4B' }}>
                      {item.patient_name}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#6D28D9', background: '#EDE9FE', padding: '2px 8px', borderRadius: 999 }}>
                      {item.mr_number || item.patient_code}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: '#4B5563' }}>
                    <Clock size={13} style={{ color: '#6D28D9' }} />
                    <span>{item.scheduled_time ? new Date(item.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Scheduled'}</span>
                    <span>•</span>
                    <span style={{ textTransform: 'capitalize', fontWeight: 600, color: item.status === 'completed' ? '#059669' : '#D97706' }}>
                      {item.status}
                    </span>
                  </div>

                  {item.diagnosis && (
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>
                      Diagnosis: <strong>{item.diagnosis}</strong>
                    </div>
                  )}

                  {item.location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', color: '#9CA3AF' }}>
                      <MapPin size={12} />
                      <span>{item.location}</span>
                    </div>
                  )}
                </div>
              );
            }

            // 2. Pending Requests Item (including Verify Rx!)
            if (type === 'pending_requests') {
              const isRx = item.type === 'prescription_verification';
              return (
                <div
                  key={item.id || idx}
                  onClick={() => onPatientSelect && onPatientSelect(item.patient_id, { isRx, prescriptionId: item.id })}
                  style={{
                    background: isRx ? '#FEFCE8' : '#F9FAFB',
                    border: `1px solid ${isRx ? '#FEF08A' : '#E5E7EB'}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7C3AED'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = isRx ? '#FEF08A' : '#E5E7EB'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#1E1B4B' }}>
                      {item.patient_name}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: isRx ? '#FEF3C7' : '#EDE9FE',
                        color: isRx ? '#D97706' : '#6D28D9',
                      }}
                    >
                      {isRx ? 'Verify Rx' : (item.type ? item.type.replace(/_/g, ' ') : 'Request')}
                    </span>
                  </div>

                  {isRx ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '12px', color: '#1E1B4B' }}>
                      <div>
                        <strong>{item.medication}</strong> • {item.dosage} ({item.frequency})
                      </div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>
                        Route: {item.route || 'Oral'} • Ordered by: {item.ordering_doctor_name || item.entered_by || 'Staff'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#D97706', fontWeight: 600, marginTop: 2 }}>
                        Click to verify / reject order in Patient File →
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '12px', color: '#4B5563' }}>
                        {item.notes || 'Clinical consultation / referral pending'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                        Urgency: <strong style={{ color: item.urgency === 'stat' || item.urgency === 'urgent' ? '#DC2626' : '#4B5563' }}>{item.urgency || 'routine'}</strong>
                      </div>
                    </>
                  )}
                </div>
              );
            }

            // 3. Patients by Tier Item
            if (type === 'patients_by_tier') {
              const tierConf = getTierChipConfig(filterParam);
              return (
                <div
                  key={item.patient_id || idx}
                  onClick={() => onPatientSelect && onPatientSelect(item.patient_id)}
                  style={{
                    background: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = tierConf.color; e.currentTarget.style.background = '#FAF5FF'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#F9FAFB'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#1E1B4B' }}>
                      {item.patient_name}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: tierConf.bg,
                        color: tierConf.color,
                        border: `1px solid ${tierConf.border}`,
                      }}
                    >
                      {tierConf.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '12px', color: '#4B5563', flexWrap: 'wrap' }}>
                    <span>BP: <strong>{item.bp || '-'}</strong></span>
                    <span>HR: <strong>{item.hr || '-'}</strong></span>
                    <span>SpO2: <strong>{item.spo2 ? `${item.spo2}%` : '-'}</strong></span>
                    {item.temp && <span>Temp: <strong>{item.temp}°C</strong></span>}
                    {item.blood_glucose && <span>BG: <strong>{item.blood_glucose}</strong></span>}
                  </div>

                  {item.reason && (
                    <div style={{ fontSize: '11px', color: '#D97706', background: '#FFFBEB', padding: '3px 8px', borderRadius: 6 }}>
                      {item.reason}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#9CA3AF', marginTop: 2 }}>
                    <span>MR: {item.mr_number || item.patient_code}</span>
                    <span style={{ color: '#6D28D9', fontWeight: 600 }}>Open File →</span>
                  </div>
                </div>
              );
            }

            return null;
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

