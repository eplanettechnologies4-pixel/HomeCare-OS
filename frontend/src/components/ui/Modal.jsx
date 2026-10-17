import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 600,
  className = '',
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        className={`modal ${className}`.trim()}
        style={{ maxWidth, width: '100%' }}
        role="dialog"
        aria-modal="true"
      >
        {(title || onClose) && (
          <div className="modal-header">
            <div>
              {title && <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>}
              {subtitle && <p className="text-muted" style={{ marginTop: 2, marginBottom: 0 }}>{subtitle}</p>}
            </div>
            {onClose && (
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={onClose}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className="modal-body">
          {children}
        </div>

        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 440,
  className = '',
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside
        className={`drawer-panel ${className}`.trim()}
        style={{ width: `min(${width}px, 100vw)` }}
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-header">
          <div>
            {title && <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>}
            {subtitle && <p className="text-muted" style={{ marginTop: 2, marginBottom: 0 }}>{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClose}
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="drawer-body">
          {children}
        </div>
      </aside>
    </>
  );
}

export default Modal;
