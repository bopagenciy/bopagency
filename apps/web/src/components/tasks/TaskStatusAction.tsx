'use client';

import { useTransition } from 'react';
import type { Task } from '@bop-agency/domain';
import { getTaskNextStates } from '@bop-agency/domain';
import { updateTaskStatusAction } from '@/app/(protected)/tasks/actions';
import type { TaskStatus } from '@bop-agency/shared';

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Completada',
  cancelled: 'Cancelada',
  blocked: 'Bloqueada',
};

type TaskStatusActionProps = {
  task: Task;
};

export function TaskStatusAction({ task }: TaskStatusActionProps) {
  const [isPending, startTransition] = useTransition();
  const nextStates = getTaskNextStates(task.status);

  // Estado final — sin acciones
  if (nextStates.length === 0) {
    return null;
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as TaskStatus;
    if (!newStatus) return;
    startTransition(async () => {
      await updateTaskStatusAction({ taskId: task.id, status: newStatus });
    });
  }

  return (
    <select
      onChange={handleChange}
      defaultValue=""
      disabled={isPending}
      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 cursor-pointer"
      aria-label={`Cambiar estado de ${task.title}`}
      aria-busy={isPending}
    >
      <option value="" disabled>
        {isPending ? 'Actualizando…' : 'Cambiar estado'}
      </option>
      {nextStates.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
