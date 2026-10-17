import React, { forwardRef } from 'react';
import { Search } from 'lucide-react';

export const FormLabel = ({ children, required, htmlFor, className = '' }) => (
  <label htmlFor={htmlFor} className={`form-label ${className}`.trim()}>
    <span>{children}</span>
    {required && <span className="required-marker" aria-hidden="true">*</span>}
  </label>
);

export const FormHelper = ({ children, error, className = '' }) => {
  if (error) {
    return <span className={`form-error ${className}`.trim()}>{error}</span>;
  }
  if (children) {
    return <span className={`form-helper ${className}`.trim()}>{children}</span>;
  }
  return null;
};

export const Input = forwardRef(function Input(
  {
    label,
    required = false,
    error,
    helperText,
    icon: Icon = null,
    className = '',
    id,
    type = 'text',
    ...props
  },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const isSearch = type === 'search' || (!Icon && props.name === 'search');
  const ActiveIcon = Icon || (isSearch ? Search : null);

  const inputElem = (
    <input
      ref={ref}
      id={inputId}
      type={type}
      className={`form-input ${error ? 'has-error' : ''} ${ActiveIcon ? 'search-input' : ''} ${className}`.trim()}
      {...props}
    />
  );

  return (
    <div className="form-group" style={{ marginBottom: 16 }}>
      {label && <FormLabel htmlFor={inputId} required={required}>{label}</FormLabel>}
      {ActiveIcon ? (
        <div className="search-input-wrap">
          <ActiveIcon size={16} />
          {inputElem}
        </div>
      ) : (
        inputElem
      )}
      <FormHelper error={error}>{helperText}</FormHelper>
    </div>
  );
});

export const Select = forwardRef(function Select(
  {
    label,
    required = false,
    error,
    helperText,
    children,
    className = '',
    id,
    ...props
  },
  ref
) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="form-group" style={{ marginBottom: 16 }}>
      {label && <FormLabel htmlFor={selectId} required={required}>{label}</FormLabel>}
      <select
        ref={ref}
        id={selectId}
        className={`form-select ${error ? 'has-error' : ''} ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
      <FormHelper error={error}>{helperText}</FormHelper>
    </div>
  );
});

export const Textarea = forwardRef(function Textarea(
  {
    label,
    required = false,
    error,
    helperText,
    className = '',
    id,
    rows = 3,
    ...props
  },
  ref
) {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="form-group" style={{ marginBottom: 16 }}>
      {label && <FormLabel htmlFor={textareaId} required={required}>{label}</FormLabel>}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        className={`form-textarea ${error ? 'has-error' : ''} ${className}`.trim()}
        {...props}
      />
      <FormHelper error={error}>{helperText}</FormHelper>
    </div>
  );
});

export default Input;
