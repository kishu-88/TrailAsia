import { useId } from 'react';

/**
 * Label, control and error message as one unit.
 *
 * The error is wired to the input with aria-describedby and aria-invalid, so a
 * screen reader announces *why* a field was rejected rather than just that
 * something on the form failed. The API returns errors keyed by field name, so
 * these slot straight in.
 */
function FieldShell({ label, error, hint, required, htmlFor, children }) {
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && (
        <p className="field__error" id={`${htmlFor}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, error, hint, required, type = 'text', ...rest }) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} htmlFor={id}>
      <input
        id={id}
        type={type}
        className="field__input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextArea({ label, error, hint, required, rows = 3, ...rest }) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        className="field__input field__input--textarea"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

/** `options` is [{ value, label }] or a plain array of strings. */
export function SelectField({ label, error, hint, required, options = [], placeholder, ...rest }) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} htmlFor={id}>
      <select
        id={id}
        className="field__input field__input--select"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const text = typeof option === 'string' ? option : option.label;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ label, hint, checked, onChange, ...rest }) {
  const id = useId();
  return (
    <div className="field field--checkbox">
      <input
        id={id}
        type="checkbox"
        className="field__checkbox"
        checked={Boolean(checked)}
        onChange={onChange}
        {...rest}
      />
      <label className="field__label field__label--inline" htmlFor={id}>
        {label}
        {hint && <span className="field__hint field__hint--inline">{hint}</span>}
      </label>
    </div>
  );
}

/** Lays fields out in a responsive two-column grid. */
export function FieldGrid({ columns = 2, children }) {
  return <div className={`field-grid field-grid--${columns}`}>{children}</div>;
}
