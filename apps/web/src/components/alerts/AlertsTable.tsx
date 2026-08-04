'use client';

import { AlertSeverityBadge } from './AlertSeverityBadge';
import { AlertStatusBadge } from './AlertStatusBadge';
import { AlertActions } from './AlertActions';
import { EmptyState } from '@/components/common/EmptyState';
import type { Alert } from '@bop-agency/domain';

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  twitter: 'X',
  other: 'Otro',
};

type AlertsTableProps = {
  alerts: Alert[];
  userRole: string;
};

export function AlertsTable({ alerts, userRole }: AlertsTableProps) {
  if (alerts.length === 0) {
    return (
      <EmptyState
        icon="🔕"
        title="Sin alertas"
        description="No hay alertas que coincidan con los filtros seleccionados."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm" aria-label="Lista de alertas">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Alerta</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
              Plataforma
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Severidad</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">
              Detectada
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {alerts.map((alert) => (
            <tr key={alert.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{alert.title ?? alert.alertType}</p>
                  {alert.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                      {alert.description}
                    </p>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                {alert.platform ? (PLATFORM_LABELS[alert.platform] ?? alert.platform) : '—'}
              </td>
              <td className="px-4 py-3">
                <AlertSeverityBadge severity={alert.severity} />
              </td>
              <td className="px-4 py-3">
                <AlertStatusBadge status={alert.status} />
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                {alert.detectedAt
                  ? new Date(alert.detectedAt).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <AlertActions alert={alert} userRole={userRole} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
