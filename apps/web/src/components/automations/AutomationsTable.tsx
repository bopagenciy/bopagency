'use client';

import Link from 'next/link';
import type { Automation } from '@bop-agency/domain';
import { AutomationStatusBadge } from './AutomationStatusBadge';
import { AutomationActions } from './AutomationActions';
import { EmptyState } from '@/components/common/EmptyState';

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  schedule: 'Programada',
  webhook: 'Webhook',
  event: 'Evento',
};

type AutomationsTableProps = {
  automations: Automation[];
  userRole: string;
};

export function AutomationsTable({ automations, userRole }: AutomationsTableProps) {
  if (automations.length === 0) {
    return (
      <EmptyState
        icon="⚙️"
        title="Sin automatizaciones"
        description="No hay automatizaciones que coincidan con los filtros seleccionados."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm" aria-label="Lista de automatizaciones">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
              Tipo
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">
              Actualizada
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {automations.map((automation) => (
            <tr key={automation.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/automations/${automation.id}`}
                  className="font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                >
                  {automation.name}
                </Link>
                {automation.description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                    {automation.description}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                {TRIGGER_LABELS[automation.triggerConfig.type] ?? automation.triggerConfig.type}
              </td>
              <td className="px-4 py-3">
                <AutomationStatusBadge status={automation.status} />
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                {new Date(automation.updatedAt).toLocaleDateString('es-CO', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </td>
              <td className="px-4 py-3 text-right">
                <AutomationActions automation={automation} userRole={userRole} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
