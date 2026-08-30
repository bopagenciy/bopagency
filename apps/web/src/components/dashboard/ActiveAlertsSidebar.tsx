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
    <div className="bg-card text-card-foreground rounded-lg border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Alertas activas</h2>
        <Link href="/alerts" className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium">
          Ver todas →
        </Link>
      </div>

      {alerts.length === 0 ? (
        <div className="px-5 py-10 text-center text-muted-foreground">
          <div className="text-3xl mb-2" aria-hidden="true">
            ✅
          </div>
          <p className="text-sm font-medium text-foreground">Sin alertas activas</p>
        </div>
      ) : (
        <ul className="divide-y divide-border" aria-label="Alertas activas recientes">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`px-5 py-3 border-l-4 ${SEVERITY_STYLES[alert.severity] ?? 'border-l-border'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {alert.title ?? alert.alertType}
                  </p>
                  {alert.detectedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(alert.detectedAt).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </p>
                  )}
                </div>
                <span
                  className={`flex-shrink-0 text-xs font-medium ${SEVERITY_TEXT[alert.severity] ?? 'text-muted-foreground'}`}
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
