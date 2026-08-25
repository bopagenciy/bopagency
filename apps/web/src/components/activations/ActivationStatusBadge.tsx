import type { ActivationStatus } from '@bop-agency/shared';

const LABELS: Record<ActivationStatus, string> = {
  pending: 'Pendiente',
  preparing: 'En preparación',
  ready: 'Lista',
  scheduled: 'Programada',
  executing: 'En ejecución',
  completed: 'Completada',
  partially_completed: 'Parcialmente completada',
  failed: 'Fallida',
  cancelled: 'Cancelada',
};

const STYLES: Record<ActivationStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 ring-gray-200',
  preparing: 'bg-amber-100 text-amber-800 ring-amber-200',
  ready: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  scheduled: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  executing: 'bg-amber-100 text-amber-800 ring-amber-200',
  completed: 'bg-green-100 text-green-800 ring-green-200',
  partially_completed: 'bg-orange-100 text-orange-800 ring-orange-200',
  failed: 'bg-red-100 text-red-700 ring-red-200',
  cancelled: 'bg-gray-100 text-gray-600 ring-gray-200',
};

type Props = { status: ActivationStatus; className?: string };

export function ActivationStatusBadge({ status, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${STYLES[status]} ${className}`}
      aria-label={`Estado de activación: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}

export const ACTIVATION_STATUS_LABELS = LABELS;
