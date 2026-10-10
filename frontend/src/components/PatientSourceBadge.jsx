import React from 'react';

/**
 * Small badge indicating patient origin source:
 * - 'public_website'    -> "Public Website" (blue badge)
 * - 'public_mobile_app' -> "Public App" (teal/green badge)
 * - 'admin_dashboard'   -> "Admin" (slate/grey badge)
 */
export default function PatientSourceBadge({ source, style = {} }) {
  let label = 'Admin';
  let badgeStyle = {
    background: '#f1f5f9',
    color: '#475569',
    border: '1px solid #cbd5e1',
  };

  if (source === 'public_website') {
    label = 'Public Website';
    badgeStyle = {
      background: '#eff6ff',
      color: '#1d4ed8',
      border: '1px solid #bfdbfe',
    };
  } else if (source === 'public_mobile_app') {
    label = 'Public App';
    badgeStyle = {
      background: '#f0fdf4',
      color: '#15803d',
      border: '1px solid #bbf7d0',
    };
  }

  return (
    <span
      className="badge"
      title={`Patient Source: ${label}`}
      style={{
        fontSize: '0.68rem',
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: '9999px',
        display: 'inline-flex',
        alignItems: 'center',
        lineHeight: 1.2,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...badgeStyle,
        ...style,
      }}
    >
      {label}
    </span>
  );
}
