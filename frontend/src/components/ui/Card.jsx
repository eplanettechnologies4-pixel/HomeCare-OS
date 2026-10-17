import React from 'react';

/**
 * Standardized Card Component
 */
export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div className={`card ${hover ? 'card-hover' : ''} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, children, className = '', ...props }) {
  return (
    <div className={`card-header ${className}`.trim()} {...props}>
      {children ? (
        children
      ) : (
        <>
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="text-muted" style={{ marginTop: 2 }}>{subtitle}</p>}
          </div>
          {action && <div className="card-action">{action}</div>}
        </>
      )}
    </div>
  );
}

export function CardBody({ children, className = '', ...props }) {
  return (
    <div className={`card-body ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', ...props }) {
  return (
    <div
      className={`card-footer ${className}`.trim()}
      style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 12,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
