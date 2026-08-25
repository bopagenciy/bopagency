import type { ActivationTargetStatus } from '@bop-agency/shared';

const LABELS: Record<ActivationTargetStatus, string> = {
  pending: 'Pendiente',
  preparing: 'En preparación',
  ready: 'Listo',
  scheduled: 'Programado',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Fallido',
  cancelled: 'Cancelado',
};

const STYLES: Record<ActivationTargetStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 ring-gray-200',
  preparing: 'bg-amber-100 text-amber-800 ring-amber-200',
  ready: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  scheduled: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  publishing: 'bg-amber-100 text-amber-800 ring-amber-200',
  published: 'bg-green-100 text-green-800 ring-green-200',
  failed: 'bg-red-100 text-red-700 ring-red-200',
  cancelled: 'bg-gray-100 text-gray-600 ring-gray-200',
};

type Props = { status: ActivationTargetStatus; className?: string };

export function ActivationTargetStatusBadge({ status, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${STYLES[status]} ${className}`}
      aria-label={`Estado del target: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}

export const ACTIVATION_TARGET_STATUS_LABELS = LABELS;
