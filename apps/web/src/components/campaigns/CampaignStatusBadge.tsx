import type { CampaignStatus } from '@bop-agency/shared';

const LABELS: Record<CampaignStatus, string> = {
  draft: 'Borrador',
  review: 'En revisión',
  approved: 'Aprobada',
  active: 'Activa',
  paused: 'Pausada',
  completed: 'Completada',
  rejected: 'Rechazada',
};

const STYLES: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 ring-gray-200',
  review: 'bg-amber-100 text-amber-800 ring-amber-200',
  approved: 'bg-green-100 text-green-800 ring-green-200',
  active: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  paused: 'bg-amber-100 text-amber-800 ring-amber-200',
  completed: 'bg-gray-100 text-gray-600 ring-gray-200',
  rejected: 'bg-red-100 text-red-700 ring-red-200',
};

type Props = { status: CampaignStatus; className?: string };

export function CampaignStatusBadge({ status, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${STYLES[status]} ${className}`}
      aria-label={`Estado: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
