import type { ReactNode } from 'react';

type AlertType = 'info' | 'success' | 'warning' | 'error';

type AlertProps = {
  type?: AlertType;
  title?: string;
  children: ReactNode;
};

const typeClasses: Record<AlertType, string> = {
  info: 'bg-blue-50/80 border-blue-200 text-blue-900',
  success: 'bg-emerald-50/80 border-emerald-200 text-emerald-900',
  warning: 'bg-amber-50/80 border-amber-200 text-amber-900',
  error: 'bg-red-50/80 border-red-200 text-red-900',
};

const typeIcons: Record<AlertType, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '🔴',
};

export function Alert({ type = 'info', title, children }: AlertProps) {
  return (
    <div className={`rounded-lg border px-4 py-3 flex gap-3 ${typeClasses[type]}`}>
      <span>{typeIcons[type]}</span>
      <div>
        {title && <p className="font-medium text-sm mb-0.5">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
