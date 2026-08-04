import type { TaskPriority } from '@bop-agency/domain';

const LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

const STYLES: Record<TaskPriority, string> = {
  low: 'bg-gray-50 text-gray-500',
  medium: 'bg-blue-50 text-blue-600',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
};

type Props = { priority: TaskPriority; className?: string };

export function TaskPriorityBadge({ priority, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STYLES[priority]} ${className}`}
      aria-label={`Prioridad: ${LABELS[priority]}`}
    >
      {LABELS[priority]}
    </span>
  );
}
