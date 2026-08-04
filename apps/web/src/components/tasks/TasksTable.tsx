'use client';

import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskPriorityBadge } from './TaskPriorityBadge';
import { TaskStatusAction } from './TaskStatusAction';
import { EmptyState } from '@/components/common/EmptyState';
import type { Task } from '@bop-agency/domain';
import { isTaskOverdue } from '@bop-agency/domain';

type TasksTableProps = {
  tasks: Task[];
  /** Si el usuario puede cambiar estados (operador+). */
  canMutate: boolean;
};

export function TasksTable({ tasks, canMutate }: TasksTableProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="Sin tareas"
        description="No hay tareas que coincidan con los filtros seleccionados."
      />
    );
  }

  const now = new Date();

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm" aria-label="Lista de tareas">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Tarea</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
              Prioridad
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">
              Vence
            </th>
            {canMutate && (
              <th className="px-4 py-3 text-right font-medium text-gray-600">Acción</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {tasks.map((task) => {
            const overdue = isTaskOverdue(task, now);
            return (
              <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                        {task.description}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <TaskPriorityBadge priority={task.priority} />
                </td>
                <td className="px-4 py-3">
                  <TaskStatusBadge status={task.status} />
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {task.dueDate ? (
                    <span
                      className={overdue ? 'text-red-600 font-medium' : 'text-gray-500'}
                      aria-label={
                        overdue
                          ? `Vencida: ${task.dueDate.toLocaleDateString('es-CO')}`
                          : task.dueDate.toLocaleDateString('es-CO')
                      }
                    >
                      {overdue && (
                        <span aria-hidden="true" className="mr-1">
                          ⚠️
                        </span>
                      )}
                      {task.dueDate.toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                {canMutate && (
                  <td className="px-4 py-3 text-right">
                    <TaskStatusAction task={task} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
