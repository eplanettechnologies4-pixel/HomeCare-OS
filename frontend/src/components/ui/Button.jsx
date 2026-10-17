import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Standardized Button Component
 * Heights: sm (32px), md (40px, default), lg (46px)
 * Variants: primary, secondary, ghost, danger, pill
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isPill = false,
  isLoading = false,
  disabled = false,
  icon: Icon = null,
  iconRight: IconRight = null,
  className = '',
  ...props
}) {
  const variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  }[variant] || 'btn-primary';

  const sizeClass = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  }[size] || '';

  const pillClass = isPill ? 'btn-pill' : '';

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${pillClass} ${className}`.trim()}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 size={size === 'sm' ? 14 : 16} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 14 : 16} />
      ) : null}
      {children}
      {!isLoading && IconRight && <IconRight size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}
