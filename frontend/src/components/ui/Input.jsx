import React, { forwardRef, useId } from 'react';
import { Search } from 'lucide-react';

export const FormLabel = ({ children, required, htmlFor, className = '' }) => (
  <label htmlFor={htmlFor} className={`form-label ${className}`.trim()}>
    <span>{children}</span>
    {required && <span className="required-marker" aria-hidden="true">*</span>}
  </label>
);

export const FormHelper = ({ children, error, id, className = '' }) => {
  if (error) {
    return (
      <span id={id} className={`form-error ${className}`.trim()} role="alert">
        {error}
      </span>
    );
  }
  if (children) {
    return (
      <span id={id} className={`form-helper ${className}`.trim()}>
        {children}
      </span>
    );
  }
  return null;
};

export const FormRow = ({ children, className = '', style }) => (
  <div className={`form-row ${className}`.trim()} style={style}>
    {children}
  </div>
);

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
  const generatedId = useId();
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : generatedId);
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const describedBy = errorId || helperId;

  const isSearch = type === 'search' || (!Icon && props.name === 'search');
  const ActiveIcon = Icon || (isSearch ? Search : null);

  const inputElem = (
    <input
      ref={ref}
      id={inputId}
      type={type}
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy}
      required={required}
      className={`form-input ${error ? 'has-error' : ''} ${ActiveIcon ? 'search-input' : ''} ${className}`.trim()}
      {...props}
    />
  );

  return (
    <div className="form-group">
      {label && <FormLabel htmlFor={inputId} required={required}>{label}</FormLabel>}
      {ActiveIcon ? (
        <div className="search-input-wrap">
          <ActiveIcon size={16} />
          {inputElem}
        </div>
      ) : (
        inputElem
      )}
      {error ? (
        <FormHelper id={errorId} error={error} />
      ) : (
        helperText && <FormHelper id={helperId}>{helperText}</FormHelper>
      )}
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
  const generatedId = useId();
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : generatedId);
  const errorId = error ? `${selectId}-error` : undefined;
  const helperId = helperText ? `${selectId}-helper` : undefined;
  const describedBy = errorId || helperId;

  return (
    <div className="form-group">
      {label && <FormLabel htmlFor={selectId} required={required}>{label}</FormLabel>}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        required={required}
        className={`form-select ${error ? 'has-error' : ''} ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <FormHelper id={errorId} error={error} />
      ) : (
        helperText && <FormHelper id={helperId}>{helperText}</FormHelper>
      )}
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
    rows = 4,
    maxLength,
    showCount = false,
    value,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : generatedId);
  const errorId = error ? `${textareaId}-error` : undefined;
  const helperId = helperText ? `${textareaId}-helper` : undefined;
  const describedBy = errorId || helperId;

  const currentLength = typeof value === 'string' ? value.length : 0;

  return (
    <div className="form-group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {label && <FormLabel htmlFor={textareaId} required={required}>{label}</FormLabel>}
        {(showCount || maxLength) && (
          <span className="char-counter">
            {currentLength}{maxLength ? ` / ${maxLength}` : ' characters'}
          </span>
        )}
      </div>
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        maxLength={maxLength}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        required={required}
        className={`form-textarea ${error ? 'has-error' : ''} ${className}`.trim()}
        {...props}
      />
      {error ? (
        <FormHelper id={errorId} error={error} />
      ) : (
        helperText && <FormHelper id={helperId}>{helperText}</FormHelper>
      )}
    </div>
  );
});

export const ChipGroup = ({ options, value, onChange, label, required }) => (
  <div className="form-group">
    {label && <FormLabel required={required}>{label}</FormLabel>}
    <div className="chip-group" role="radiogroup">
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`chip-btn ${isSelected ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && <opt.icon size={13} />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export const SegmentedControl = ({ options, value, onChange, label, required }) => (
  <div className="form-group">
    {label && <FormLabel required={required}>{label}</FormLabel>}
    <div className="segmented-control" role="tablist">
      {options.map((opt) => {
        const isSelected = value === opt.value;
        const urgencyClass = opt.value === 'urgent' ? 'active-urgent' : opt.value === 'emergency' ? 'active-emergency' : '';
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={`segmented-control-btn ${isSelected ? `active ${urgencyClass}` : ''}`.trim()}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && <opt.icon size={13} />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export default Input;
