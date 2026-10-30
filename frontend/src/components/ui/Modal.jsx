import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';

/**
 * Design System Modal Component
 * - Centered card: width 520px (or 640px with size="lg"), max-width 92vw, max-height 90vh
 * - Fixed header and footer, scrollable body
 * - Dim backdrop with light blur
 * - Title (18px, 600), one-line muted subtitle
 * - Close button with 40px hit area
 * - 150ms fade and scale animation
 * - Escape key & backdrop click close (with unsaved changes confirmation if isDirty)
 * - Accessible focus trap & auto-focuses first input
 */
export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md', // 'md' (520px) | 'lg' (640px)
  maxWidth,
  className = '',
  isDirty = false,
  confirmDiscardMessage = 'You have unsaved changes. Discard and close?',
}) {
  const modalRef = useRef(null);
  const titleId = useId();
  const subtitleId = useId();

  // Handle safe close with unsaved confirmation
  const handleSafeClose = () => {
    if (isDirty) {
      const confirmed = window.confirm(confirmDiscardMessage);
      if (!confirmed) return;
    }
    if (onClose) onClose();
  };

  // Keyboard navigation & Focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSafeClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Auto-focus first input on open
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const firstInput = modalRef.current.querySelector('input:not([type="hidden"]), select, textarea, button.btn-primary');
        if (firstInput) {
          firstInput.focus();
        }
      }
    }, 60);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, isDirty]);

  if (!isOpen) return null;

  const widthStyle = maxWidth
    ? { maxWidth, width: '100%' }
    : size === 'lg'
    ? { width: 640 }
    : { width: 520 };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleSafeClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className={`modal ${size === 'lg' ? 'modal-lg' : ''} ${className}`.trim()}
        style={widthStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
      >
        {(title || onClose) && (
          <div className="modal-header">
            <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
              {title && (
                <h3 id={titleId} className="modal-title">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p id={subtitleId} className="modal-subtitle">
                  {subtitle}
                </p>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleSafeClose}
                aria-label="Close dialog"
                title="Close"
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
  isDirty = false,
}) {
  const handleSafeClose = () => {
    if (isDirty) {
      if (!window.confirm('You have unsaved changes. Discard and close?')) return;
    }
    if (onClose) onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) handleSafeClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty]);

  if (!isOpen) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={handleSafeClose} />
      <aside
        className={`drawer-panel ${className}`.trim()}
        style={{ width: `min(${width}px, 100vw)` }}
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-header">
          <div>
            {title && <h3 className="modal-title">{title}</h3>}
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={handleSafeClose}
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
