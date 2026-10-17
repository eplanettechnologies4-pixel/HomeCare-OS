import React from 'react';

export function StatTile({
  label,
  value,
  subtext,
  icon: Icon = null,
  accent = 'purple',
  className = '',
  ...props
}) {
  const accentClass = {
    purple: '',
    amber: 'amber',
    red: 'red',
    green: 'green',
  }[accent] || '';

  return (
    <div className={`stat-tile ${accentClass} ${className}`.trim()} {...props}>
      {Icon && (
        <div className="stat-icon">
          <Icon size={24} />
        </div>
      )}
      <span className="stat-label">{label}</span>
      <span className="stat-value tabular-nums">{value}</span>
      {subtext && <span className="stat-sub">{subtext}</span>}
    </div>
  );
}

export default StatTile;
