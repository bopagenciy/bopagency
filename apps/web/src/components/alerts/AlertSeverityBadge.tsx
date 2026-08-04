import type { AlertSeverity } from '@bop-agency/shared';

const LABELS: Record<AlertSeverity, string> = {
  critical: 'Crítica',
  warning: 'Advertencia',
  info: 'Info',
};

const STYLES: Record<AlertSeverity, string> = {
  critical: 'bg-red-100 text-red-800 ring-red-200',
  warning: 'bg-amber-100 text-amber-800 ring-amber-200',
  info: 'bg-blue-100 text-blue-800 ring-blue-200',
};

type Props = { severity: AlertSeverity; className?: string };

export function AlertSeverityBadge({ severity, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${STYLES[severity]} ${className}`}
      aria-label={`Severidad: ${LABELS[severity]}`}
    >
      {LABELS[severity]}
    </span>
  );
}
