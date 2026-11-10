import { forwardRef, useId } from 'react';

/** Label + control + hint/error. The control receives the generated id via render-prop or `htmlFor`. */
export function Field({ label, hint, error, required, className = '', children, htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function withField(Control) {
  return forwardRef(function FieldControl({ label, hint, error, required, className = '', id, ...props }, ref) {
    const autoId = useId();
    const controlId = id || autoId;
    const control = <Control ref={ref} id={controlId} aria-invalid={error ? 'true' : undefined} required={required} {...props} />;
    if (!label && !hint && !error) return <div className={className}>{control}</div>;
    return (
      <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={controlId}>
        {control}
      </Field>
    );
  });
}

const RawInput = forwardRef(function RawInput({ className = '', ...props }, ref) {
  return <input ref={ref} className={`input ${className}`} {...props} />;
});
const RawSelect = forwardRef(function RawSelect({ className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={`input pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
});
const RawTextarea = forwardRef(function RawTextarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={`input min-h-[88px] resize-y ${className}`} {...props} />;
});

export const Input = withField(RawInput);
export const Select = withField(RawSelect);
export const Textarea = withField(RawTextarea);

export function Switch({ checked, onChange, label, description, disabled, className = '' }) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-start justify-between gap-4 ${disabled ? 'opacity-50' : ''} ${className}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={Boolean(checked)}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="h-5 w-9 rounded-full bg-border transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export const Checkbox = forwardRef(function Checkbox({ label, className = '', ...props }, ref) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm ${className}`}>
      <input ref={ref} type="checkbox" className="h-4 w-4 rounded border-border accent-[rgb(var(--c-primary))]" {...props} />
      {label}
    </label>
  );
});
