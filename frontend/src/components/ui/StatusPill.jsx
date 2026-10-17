import React from 'react';

/**
 * Standardized Badge / Status Pill
 * Variants: green, amber, red, grey, purple, blue
 */
export function StatusPill({
  children,
  variant = 'grey',
  withDot = true,
  className = '',
  ...props
}) {
  const variantClass = {
    green: 'badge-green',
    amber: 'badge-amber',
    red: 'badge-red',
    grey: 'badge-grey',
    gray: 'badge-grey',
    purple: 'badge-purple',
    blue: 'badge-blue',
  }[variant] || 'badge-grey';

  return (
    <span className={`status-pill ${variantClass} ${className}`.trim()} {...props}>
      {withDot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export const Badge = StatusPill;
export default StatusPill;
