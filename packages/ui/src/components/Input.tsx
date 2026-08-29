import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  helpText?: string;
};

export function Input({ label, error, helpText, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <input
        id={inputId}
        {...props}
        className={[
          'block w-full rounded-md border px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring',
          'disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed',
          error
            ? 'border-destructive bg-destructive/5 text-foreground placeholder:text-destructive/50'
            : 'border-border bg-card text-foreground placeholder:text-muted-foreground',
          className,
        ].join(' ')}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {helpText && !error && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
