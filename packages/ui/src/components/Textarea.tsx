import type { TextareaHTMLAttributes } from 'react';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export function Textarea({ label, error, className = '', id, rows = 4, ...props }: TextareaProps) {
  const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        {...props}
        className={[
          'block w-full rounded-md border px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring',
          'disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed',
          error ? 'border-destructive bg-destructive/5 text-foreground' : 'border-border bg-card text-foreground',
          className,
        ].join(' ')}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
