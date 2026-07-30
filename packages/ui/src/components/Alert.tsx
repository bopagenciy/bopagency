import type { ReactNode } from 'react';

type AlertType = 'info' | 'success' | 'warning' | 'error';

type AlertProps = {
  type?: AlertType;
  title?: string;
  children: ReactNode;
};

const typeClasses: Record<AlertType, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-red-50 border-red-200 text-red-800',
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
