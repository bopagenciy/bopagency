import type { AutomationStatus } from '@bop-agency/domain';

const LABELS: Record<AutomationStatus, string> = {
  draft: 'Borrador',
  active: 'Activa',
  paused: 'Pausada',
  archived: 'Archivada',
};

const STYLES: Record<AutomationStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 ring-gray-200',
  active: 'bg-green-100 text-green-800 ring-green-200',
  paused: 'bg-amber-100 text-amber-800 ring-amber-200',
  archived: 'bg-red-100 text-red-700 ring-red-200',
};

type Props = { status: AutomationStatus; className?: string };

export function AutomationStatusBadge({ status, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${STYLES[status]} ${className}`}
      aria-label={`Estado: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
