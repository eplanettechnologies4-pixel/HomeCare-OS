import React from 'react';

export function EmptyState({
  icon: Icon = null,
  title = 'No items found',
  description,
  action,
  className = '',
}) {
  return (
    <div
      className={`empty-state ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px dashed var(--border)',
      }}
    >
      {Icon && (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--gray-100)',
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Icon size={24} />
        </div>
      )}
      <h3 className="card-title" style={{ marginBottom: 4 }}>{title}</h3>
      {description && <p className="text-muted" style={{ maxWidth: 360, margin: '0 0 16px' }}>{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export default EmptyState;
