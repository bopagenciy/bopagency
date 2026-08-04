import type { AlertStatus } from '@bop-agency/shared';

const LABELS: Record<AlertStatus, string> = {
  active: 'Activa',
  acknowledged: 'Reconocida',
  snoozed: 'Silenciada',
  resolved: 'Resuelta',
};

const STYLES: Record<AlertStatus, string> = {
  active: 'bg-red-50 text-red-700 ring-red-200',
  acknowledged: 'bg-amber-50 text-amber-700 ring-amber-200',
  snoozed: 'bg-gray-100 text-gray-600 ring-gray-200',
  resolved: 'bg-green-50 text-green-700 ring-green-200',
};

type Props = { status: AlertStatus; className?: string };

export function AlertStatusBadge({ status, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${STYLES[status]} ${className}`}
      aria-label={`Estado: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
