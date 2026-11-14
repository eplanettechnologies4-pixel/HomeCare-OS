import React from 'react';
import { X, Printer } from 'lucide-react';

export default function PrintPatientFileModal({ isOpen, onClose, patientData, guardianData, treatingConsultant, careManager, briefHistory, carePlan, activeComplaint, upcomingItems, recentRecords }) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const formatVal = (v) => {
    if (v === null || v === undefined || v === '' || v === 'None' || v === 'N/A') return '-';
    return v;
  };

  const pName = patientData?.full_name || `${patientData?.first_name || ''} ${patientData?.last_name || ''}`.trim() || 'Patient';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          maxWidth: '850px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Controls Bar */}
        <div
          style={{
            background: '#6D28D9',
            color: '#FFFFFF',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '15px' }}>
            <Printer size={18} />
            <span>Print Patient File Summary</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handlePrint}
              style={{
                background: '#FFFFFF',
                color: '#6D28D9',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Printer size={15} /> Print Document
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Preview */}
        <div style={{ padding: '24px 32px', overflowY: 'auto' }} id="patient-file-print-sheet">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * { visibility: hidden; }
              #patient-file-print-sheet, #patient-file-print-sheet * { visibility: visible; }
              #patient-file-print-sheet {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 10mm;
                box-shadow: none !important;
              }
            }
          `}} />

          {/* Document Header */}
          <div style={{ borderBottom: '2px solid #6D28D9', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#6D28D9', letterSpacing: '-0.5px' }}>
                eHealth — Hospital at Home
              </h1>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                Electronic Medical Record · Patient File Summary
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#4B5563' }}>
              <div>Generated: {new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })} (PKT)</div>
              <div>MR No: <strong>{formatVal(patientData?.mr_number)}</strong></div>
            </div>
          </div>

          {/* Section 01: Identification */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #E5E7EB', paddingBottom: '4px', marginBottom: '8px' }}>
              01 · Patient Identification
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '11px' }}>
              <div>
                <span style={{ color: '#6B7280', display: 'block' }}>Patient Name</span>
                <strong>{pName}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280', display: 'block' }}>MR / Patient Code</span>
                <strong>{formatVal(patientData?.mr_number)} / {formatVal(patientData?.patient_code)}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280', display: 'block' }}>Age / Gender</span>
                <strong>{formatVal(patientData?.age)} yrs / {formatVal(patientData?.gender_display || patientData?.gender)}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280', display: 'block' }}>Location</span>
                <strong>{formatVal(patientData?.location)}</strong>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '11px', marginTop: '8px' }}>
              <div>
                <span style={{ color: '#6B7280', display: 'block' }}>Treating Consultant</span>
                <strong>{treatingConsultant ? `${treatingConsultant.name} (${treatingConsultant.specialization})` : '-'}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280', display: 'block' }}>Care Manager</span>
                <strong>{careManager ? careManager.name : '-'}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280', display: 'block' }}>Legal Guardian</span>
                <strong>{formatVal(guardianData?.name)} ({formatVal(guardianData?.relation)}) {guardianData?.phone ? `· ${guardianData.phone}` : ''}</strong>
              </div>
            </div>
          </div>

          {/* Section 02: Brief History & Current Care Plan with Highlighted Active Complaint */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #E5E7EB', paddingBottom: '4px', marginBottom: '8px' }}>
              02 · Brief History & Current Care Plan
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '11px', marginBottom: '10px' }}>
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '10px' }}>
                <span style={{ fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>Brief Medical History:</span>
                <div style={{ color: '#4B5563', lineHeight: 1.4 }}>{briefHistory || '-'}</div>
              </div>
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '10px' }}>
                <span style={{ fontWeight: 700, color: '#374151', display: 'block', marginBottom: '4px' }}>Current Clinical Care Plan:</span>
                <div style={{ color: '#4B5563', lineHeight: 1.4 }}>{carePlan || '-'}</div>
              </div>
            </div>

            {/* Highlighted Active Complaint */}
            <div style={{ border: '2px solid #D97706', background: '#FFFBEB', borderRadius: '6px', padding: '10px', fontSize: '11px' }}>
              <strong style={{ color: '#B45309', display: 'block', marginBottom: '2px' }}>
                ⚠️ Active Complaint (Important Note):
              </strong>
              <div style={{ color: '#92400E', fontWeight: 600 }}>
                {activeComplaint?.text || 'No active complaint recorded.'}
              </div>
            </div>
          </div>

          {/* Section 03: Clinical Records List */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #E5E7EB', paddingBottom: '4px', marginBottom: '8px' }}>
              03 · Recent Clinical Records Summary
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'left' }}>Date / Time (PKT)</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'left' }}>Record Type</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'left' }}>Author / Role</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'left' }}>Summary & Notes</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'center' }}>Signed</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords && recentRecords.length > 0 ? (
                  recentRecords.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px' }}>
                        {r.occurred_at ? new Date(r.occurred_at).toLocaleDateString('en-GB') : '-'}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px', fontWeight: 600 }}>{r.title}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px' }}>{r.author_name} ({r.author_role})</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px' }}>{r.summary}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px', textAlign: 'center' }}>
                        {r.is_signed ? '✓ Signed' : 'Draft'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'center', color: '#9CA3AF' }}>
                      No clinical records in the selected window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Section 04: Upcoming Procedures & Appointments */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #E5E7EB', paddingBottom: '4px', marginBottom: '8px' }}>
              04 · Upcoming Procedures, Appointments & Blood Tests
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'left' }}>Item / Description</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'left' }}>Type</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'left' }}>Due (PKT)</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'left' }}>Status</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px', textAlign: 'left' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {upcomingItems && upcomingItems.length > 0 ? (
                  upcomingItems.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px', fontWeight: 600 }}>{item.title}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px', textTransform: 'capitalize' }}>
                        {item.kind ? item.kind.replace('_', ' ') : '-'}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px', color: item.is_overdue ? '#DC2626' : '#1E1B4B' }}>
                        {item.due_relative} {item.due_at ? `(${new Date(item.due_at).toLocaleDateString('en-GB')})` : ''}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px', textTransform: 'capitalize' }}>
                        {item.status || 'scheduled'}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '5px' }}>{item.notes || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'center', color: '#9CA3AF' }}>
                      No upcoming items scheduled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ marginTop: '24px', borderTop: '1px solid #E5E7EB', paddingTop: '8px', fontSize: '9px', color: '#9CA3AF', display: 'flex', justifyContent: 'space-between' }}>
            <span>HomeCare OS · Confidential Clinical Patient File</span>
            <span>Page 1 of 1</span>
          </div>

        </div>
      </div>
    </div>
  );
}

