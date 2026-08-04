import Link from 'next/link';
import type { Alert } from '@bop-agency/domain';

type ActiveAlertsSidebarProps = {
  alerts: Alert[];
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50',
  warning: 'border-l-amber-400 bg-amber-50',
  info: 'border-l-blue-400 bg-blue-50',
};

const SEVERITY_TEXT: Record<string, string> = {
  critical: 'text-red-700',
  warning: 'text-amber-700',
  info: 'text-blue-700',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Crítica',
  warning: 'Advertencia',
  info: 'Info',
};

export function ActiveAlertsSidebar({ alerts }: ActiveAlertsSidebarProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Alertas activas</h2>
        <Link href="/alerts" className="text-xs text-red-600 hover:text-red-700 transition-colors">
          Ver todas →
        </Link>
      </div>

      {alerts.length === 0 ? (
        <div className="px-5 py-10 text-center text-gray-400">
          <div className="text-3xl mb-2" aria-hidden="true">
            ✅
          </div>
          <p className="text-sm font-medium text-gray-600">Sin alertas activas</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100" aria-label="Alertas activas recientes">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`px-5 py-3 border-l-4 ${SEVERITY_STYLES[alert.severity] ?? 'border-l-gray-300'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {alert.title ?? alert.alertType}
                  </p>
                  {alert.detectedAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(alert.detectedAt).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </p>
                  )}
                </div>
                <span
                  className={`flex-shrink-0 text-xs font-medium ${SEVERITY_TEXT[alert.severity] ?? 'text-gray-600'}`}
                  aria-label={`Severidad: ${SEVERITY_LABELS[alert.severity] ?? alert.severity}`}
                >
                  {SEVERITY_LABELS[alert.severity] ?? alert.severity}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
