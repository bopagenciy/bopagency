'use client';

import { AlertSeverityBadge } from './AlertSeverityBadge';
import { AlertStatusBadge } from './AlertStatusBadge';
import { AlertActions } from './AlertActions';
import { EmptyState } from '@/components/common/EmptyState';
import type { Alert } from '@bop-agency/domain';

// ─── Phase 6F: Automation alert helpers ───────────────────────────────────────

/**
 * Retorna true si la alerta fue generada por el sistema de automatizaciones.
 * Nunca expone datos técnicos internos.
 */
function isAutomationAlert(alertType: string | null | undefined): boolean {
  return !!alertType?.startsWith('automation.');
}

/**
 * Extrae enlaces seguros de automatización desde metadata.
 * Solo retorna IDs — sin tokens, secretos ni stack traces.
 */
function getAutomationLinks(
  metadata: Record<string, unknown>,
): { automationId?: string; executionId?: string } | null {
  const automationId = typeof metadata.automationId === 'string' ? metadata.automationId : null;
  const executionId  = typeof metadata.executionId  === 'string' ? metadata.executionId  : null;
  if (!automationId && !executionId) return null;
  return {
    ...(automationId ? { automationId } : {}),
    ...(executionId  ? { executionId  } : {}),
  };
}

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
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{alert.title ?? alert.alertType}</p>
                    {isAutomationAlert(alert.alertType) && (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700"
                        aria-label="Alerta generada por automatización"
                      >
                        ⚙️ Auto
                      </span>
                    )}
                  </div>
                  {alert.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                      {alert.description}
                    </p>
                  )}
                  {isAutomationAlert(alert.alertType) && (() => {
                    const links = getAutomationLinks(alert.metadata);
                    if (!links) return null;
                    return (
                    <div className="flex items-center gap-2 mt-1">
                      {links.automationId && (
                        <a
                          href={`/automations/${links.automationId}`}
                          className="text-xs text-purple-600 hover:text-purple-800 underline"
                          aria-label="Ver automatización relacionada"
                        >
                          Ver automatización
                        </a>
                      )}
                      {links.executionId && (
                        <a
                          href={`/automations/${links.automationId}/executions`}
                          className="text-xs text-purple-600 hover:text-purple-800 underline"
                          aria-label="Ver ejecución relacionada"
                        >
                          Ver ejecución
                        </a>
                      )}
                    </div>
                    );
                  })()}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                {isAutomationAlert(alert.alertType) ? (
                  <span className="text-purple-600 text-xs">Automatización</span>
                ) : (
                  alert.platform ? (PLATFORM_LABELS[alert.platform] ?? alert.platform) : '—'
                )}
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
