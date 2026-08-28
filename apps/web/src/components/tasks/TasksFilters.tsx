'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { TASK_STATUSES } from '@bop-agency/shared';
import type { TaskStatus } from '@bop-agency/shared';

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Completada',
  cancelled: 'Cancelada',
  blocked: 'Bloqueada',
};

type TasksFiltersProps = {
  status: string;
  overdue: string;
};

export function TasksFilters({ status, overdue }: TasksFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    startTransition(() => {
      router.push(`/tasks?${params.toString()}`);
    });
  }

  return (
    <div
      className={`flex flex-col sm:flex-row gap-3 ${isPending ? 'opacity-70' : ''}`}
      role="search"
      aria-label="Filtros de tareas"
    >
      <select
        value={status}
        onChange={(e) => updateFilter('status', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        aria-label="Filtrar por estado"
      >
        <option value="">Todos los estados</option>
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <select
        value={overdue}
        onChange={(e) => updateFilter('overdue', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        aria-label="Filtrar por vencimiento"
      >
        <option value="">Todas las tareas</option>
        <option value="true">Solo vencidas</option>
      </select>
    </div>
  );
}
