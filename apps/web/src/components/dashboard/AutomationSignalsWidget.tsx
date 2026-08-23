/**
 * AutomationSignalsWidget — Phase 6F
 *
 * Muestra señales operativas de automatizaciones en el dashboard:
 * - Ejecuciones fallidas recientes
 * - Ejecuciones en running
 * - Alertas activas de automatización
 * - Accesos rápidos a /automations y ejecuciones
 *
 * Sin consultas N+1: recibe datos pre-cargados del Server Component padre.
 * Sin gráficas complejas. Responsive y accesible.
 */

'use client';

import Link from 'next/link';

export type AutomationSignalData = {
  readonly activeAutomations: number;
  readonly recentFailedExecutions: number;
  readonly runningExecutions: number;
  readonly activeAutomationAlerts: number;
  readonly pendingAutomationTasks: number;
};

type AutomationSignalsWidgetProps = {
  data: AutomationSignalData;
};

export function AutomationSignalsWidget({ data }: AutomationSignalsWidgetProps) {
  const hasIssues =
    data.recentFailedExecutions > 0 ||
    data.activeAutomationAlerts > 0 ||
    data.pendingAutomationTasks > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <span aria-hidden="true">⚙️</span>
          Automatizaciones
        </h2>
        <Link
          href="/automations"
          className="text-xs text-primary hover:text-primary-hover transition-colors"
          aria-label="Ver todas las automatizaciones"
        >
          Ver todas →
        </Link>
      </div>

      <div className="p-5 space-y-3">
        {/* Señales de estado */}
        <div className="grid grid-cols-2 gap-3" role="list" aria-label="Señales operativas de automatizaciones">
          <SignalCard
            label="Activas"
            value={data.activeAutomations}
            href="/automations?status=active"
            color="green"
          />
          <SignalCard
            label="En ejecución"
            value={data.runningExecutions}
            href="/automations"
            color={data.runningExecutions > 0 ? 'blue' : 'gray'}
          />
          <SignalCard
            label="Fallidas recientes"
            value={data.recentFailedExecutions}
            href="/automations"
            color={data.recentFailedExecutions > 0 ? 'red' : 'gray'}
            aria-label={`${data.recentFailedExecutions} ejecuciones fallidas recientes`}
          />
          <SignalCard
            label="Alertas activas"
            value={data.activeAutomationAlerts}
            href="/alerts"
            color={data.activeAutomationAlerts > 0 ? 'amber' : 'gray'}
          />
        </div>

        {/* Tareas pendientes de automatización */}
        {data.pendingAutomationTasks > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <Link
              href="/tasks"
              className="flex items-center justify-between text-sm text-amber-700 bg-amber-50 rounded px-3 py-2 hover:bg-amber-100 transition-colors"
              aria-label={`${data.pendingAutomationTasks} tareas operativas de automatización pendientes`}
            >
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true">📋</span>
                {data.pendingAutomationTasks} tarea{data.pendingAutomationTasks !== 1 ? 's' : ''} operativa{data.pendingAutomationTasks !== 1 ? 's' : ''} pendiente{data.pendingAutomationTasks !== 1 ? 's' : ''}
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}

        {/* Estado sin incidentes */}
        {!hasIssues && data.activeAutomations === 0 && (
          <div className="text-center py-4 text-gray-400 text-sm">
            <div className="text-2xl mb-1" aria-hidden="true">⚙️</div>
            <p>Sin automatizaciones configuradas</p>
          </div>
        )}
        {!hasIssues && data.activeAutomations > 0 && (
          <div className="text-center py-2 text-green-600 text-xs">
            <span aria-hidden="true">✓ </span>Sin incidentes activos
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

type SignalCardProps = {
  label: string;
  value: number;
  href: string;
  color: 'green' | 'blue' | 'red' | 'amber' | 'gray';
  'aria-label'?: string;
};

const COLOR_MAP: Record<SignalCardProps['color'], string> = {
  green: 'bg-green-50 text-green-700',
  blue:  'bg-blue-50 text-blue-700',
  red:   'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  gray:  'bg-gray-50 text-gray-500',
};

function SignalCard({ label, value, href, color, 'aria-label': ariaLabel }: SignalCardProps) {
  return (
    <Link
      href={href}
      className={`rounded-lg p-3 text-center block hover:opacity-80 transition-opacity ${COLOR_MAP[color]}`}
      role="listitem"
      aria-label={ariaLabel ?? `${value} ${label}`}
    >
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-0.5">{label}</div>
    </Link>
  );
}
