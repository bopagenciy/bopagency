import type { AutomationExecutionStatus } from '@bop-agency/domain';

const LABELS: Record<AutomationExecutionStatus, string> = {
  queued: 'En cola',
  running: 'En ejecución',
  succeeded: 'Exitosa',
  failed: 'Fallida',
  cancelled: 'Cancelada',
  retrying: 'Reintentando',
};

const STYLES: Record<AutomationExecutionStatus, string> = {
  queued: 'bg-blue-100 text-blue-700 ring-blue-200',
  running: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  succeeded: 'bg-green-100 text-green-800 ring-green-200',
  failed: 'bg-red-100 text-red-700 ring-red-200',
  cancelled: 'bg-gray-100 text-gray-600 ring-gray-200',
  retrying: 'bg-amber-100 text-amber-800 ring-amber-200',
};

type Props = { status: AutomationExecutionStatus; className?: string };

export function ExecutionStatusBadge({ status, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${STYLES[status]} ${className}`}
      aria-label={`Estado: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
