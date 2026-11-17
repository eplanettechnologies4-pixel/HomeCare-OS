import React from 'react';
import { Shield } from 'lucide-react';
import useStore from '../store/useStore';
import { ROLE_CONFIG } from '../data/mockData';

export default function RoleSelector() {
  const currentRole    = useStore((s) => s.currentRole);
  const setCurrentRole = useStore((s) => s.setCurrentRole);
  const setActivePage  = useStore((s) => s.setActivePage);

  const normalizedRole = {
    physio: 'physiotherapist',
    speech: 'speech_therapist',
    psychologist: 'psychotherapist',
  }[currentRole] || currentRole;

  const handleRoleChange = (e) => {
    const role = e.target.value;
    setCurrentRole(role);
    // If switching to patient_family, navigate to family-portal
    if (role === 'patient_family') {
      setActivePage('family-portal');
    } else {
      const allowedNav = ROLE_CONFIG[role]?.nav || ['overview'];
      if (!allowedNav.includes(useStore.getState().activePage)) {
        setActivePage(allowedNav[0]);
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--gray-100)',
        border: '1px solid var(--border)',
        padding: '0 12px',
        height: 38,
        borderRadius: 'var(--radius-control)',
      }}
    >
      <Shield size={15} style={{ color: 'var(--primary)' }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Role:
      </span>
      <select
        value={normalizedRole}
        onChange={handleRoleChange}
        style={{
          border: 'none',
          background: 'transparent',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text)',
          cursor: 'pointer',
          outline: 'none',
          paddingRight: 8,
        }}
        aria-label="Switch User Role"
      >
        {/* Canonical role list — explicit array avoids any Object.entries enumeration issues */}
        {[
          'super_admin', 'admin', 'branch_manager', 'care_manager',
          'doctor', 'physiotherapist', 'speech_therapist', 'psychotherapist',
          'nurse', 'dietician', 'accountant', 'crm_executive', 'patient_family',
        ].filter(key => ROLE_CONFIG[key]?.label).map(key => (
          <option key={key} value={key}>{ROLE_CONFIG[key].label}</option>
        ))}
      </select>
    </div>
  );
}
