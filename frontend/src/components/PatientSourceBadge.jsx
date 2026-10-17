import React from 'react';
import { StatusPill } from './ui/StatusPill';

/**
 * Small badge indicating patient origin source:
 * - 'public_website'    -> "Public Website" (blue badge)
 * - 'public_mobile_app' -> "Public App" (green badge)
 * - 'admin_dashboard'   -> "Admin" (grey badge)
 */
export default function PatientSourceBadge({ source, style = {} }) {
  let label = 'Admin';
  let variant = 'grey';

  if (source === 'public_website') {
    label = 'Public Website';
    variant = 'blue';
  } else if (source === 'public_mobile_app') {
    label = 'Public App';
    variant = 'green';
  }

  return (
    <StatusPill
      variant={variant}
      withDot={false}
      style={{ fontSize: 11, padding: '2px 8px', ...style }}
      title={`Patient Source: ${label}`}
    >
      {label}
    </StatusPill>
  );
}
