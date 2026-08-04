import type { TaskStatus } from '@bop-agency/shared';

const LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Completada',
  cancelled: 'Cancelada',
  blocked: 'Bloqueada',
};

const STYLES: Record<TaskStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 ring-gray-200',
  in_progress: 'bg-blue-100 text-blue-800 ring-blue-200',
  done: 'bg-green-100 text-green-800 ring-green-200',
  cancelled: 'bg-red-100 text-red-700 ring-red-200',
  blocked: 'bg-amber-100 text-amber-800 ring-amber-200',
};

type Props = { status: TaskStatus; className?: string };

export function TaskStatusBadge({ status, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${STYLES[status]} ${className}`}
      aria-label={`Estado: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
