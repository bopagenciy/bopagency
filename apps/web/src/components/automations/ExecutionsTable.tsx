'use client';

import Link from 'next/link';
import type { AutomationExecution } from '@bop-agency/domain';
import { ExecutionStatusBadge } from './ExecutionStatusBadge';
import { ExecutionActions } from './ExecutionActions';
import { EmptyState } from '@/components/common/EmptyState';

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  schedule: 'Programada',
  webhook: 'Webhook',
  event: 'Evento',
};

type ExecutionsTableProps = {
  executions: AutomationExecution[];
  maxAttempts: number;
  userRole: string;
  showAutomationLink?: boolean;
};

export function ExecutionsTable({
  executions,
  maxAttempts,
  userRole,
  showAutomationLink = false,
}: ExecutionsTableProps) {
  if (executions.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="Sin ejecuciones"
        description="No hay ejecuciones registradas para esta automatización."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm" aria-label="Lista de ejecuciones">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
              Tipo
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">
              Intento
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden lg:table-cell">
              Iniciada
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {executions.map((execution) => (
            <tr key={execution.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/automations/executions/${execution.id}`}
                  className="font-mono text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  {execution.id.slice(0, 8)}…
                </Link>
                {showAutomationLink && (
                  <Link
                    href={`/automations/${execution.automationId}`}
                    className="block text-xs text-gray-400 hover:text-gray-600 mt-0.5"
                  >
                    {execution.automationId.slice(0, 8)}…
                  </Link>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                {TRIGGER_LABELS[execution.triggerType] ?? execution.triggerType}
              </td>
              <td className="px-4 py-3">
                <ExecutionStatusBadge status={execution.status} />
              </td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                #{execution.attempt}
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                {execution.startedAt
                  ? new Date(execution.startedAt).toLocaleString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <ExecutionActions
                  execution={execution}
                  maxAttempts={maxAttempts}
                  userRole={userRole}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
