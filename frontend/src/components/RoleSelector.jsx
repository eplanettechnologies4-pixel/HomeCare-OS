import React from 'react';
import { Shield, ChevronDown } from 'lucide-react';
import useStore from '../store/useStore';
import { ROLE_CONFIG } from '../data/mockData';

export default function RoleSelector() {
  const currentRole    = useStore((s) => s.currentRole);
  const setCurrentRole = useStore((s) => s.setCurrentRole);
  const setActivePage  = useStore((s) => s.setActivePage);

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--sage-100)', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}>
      <Shield size={14} style={{ color: 'var(--teal-600)' }} />
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal-800)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role:</span>
      <select
        value={currentRole}
        onChange={handleRoleChange}
        style={{
          border: 'none',
          background: 'transparent',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: 'var(--teal-800)',
          cursor: 'pointer',
          outline: 'none'
        }}
      >
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
          <option key={key} value={key}>{cfg.label}</option>
        ))}
      </select>
    </div>
  );
}
