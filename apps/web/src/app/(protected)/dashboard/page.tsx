import Link from 'next/link';
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { AgencySummaryCards } from '@/components/dashboard/AgencySummaryCards';
import { ActiveAlertsSidebar } from '@/components/dashboard/ActiveAlertsSidebar';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDashboardComposition } from '@/lib/composition/dashboard.composition';
import type { OrganizationId } from '@bop-agency/domain';
import type { Alert } from '@bop-agency/domain';
import { AutomationSignalsWidget } from '@/components/dashboard/AutomationSignalsWidget';
import type { AutomationSignalData } from '@/components/dashboard/AutomationSignalsWidget';

export const metadata: Metadata = { title: 'Dashboard' };

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Completada',
  cancelled: 'Cancelada',
  blocked: 'Bloqueada',
};

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  blocked: 'bg-amber-100 text-amber-800',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

export default async function DashboardPage() {
  const { organization } = await requireOrganization();
  const supabase = await createServerSupabaseClient();
  const { useCases } = createDashboardComposition(supabase);
  const orgId = organization.id as OrganizationId;

  // Fetch summary and recent data in parallel — no N+1
  const [summaryResult, alertsResult, tasksResult, automationExecCountResult, activeAutomationsResult] = await Promise.all([
    useCases.getAgencyDashboardSummary({ organizationId: orgId }),
    useCases.listAlerts({
      organizationId: orgId,
      status: 'active',
      pagination: { page: 1, pageSize: 5 },
    }),
    useCases.listTasks({
      organizationId: orgId,
      pagination: { page: 1, pageSize: 5 },
    }),
    // Phase 6F: automation execution counts for dashboard signals
    useCases.countAutomationExecutionsByStatus(String(orgId)),
    useCases.listAutomations({
      organizationId: orgId,
      status: 'active',
      pagination: { page: 1, pageSize: 1 },
    }),
  ]);

  const summaryError = !summaryResult.success;
  const summary = summaryResult.success ? summaryResult.value : null;

  const recentAlerts: Alert[] = alertsResult.success ? alertsResult.value.data : [];

  // Phase 6F: Build automation signal data
  const execCounts = automationExecCountResult.success ? automationExecCountResult.value : null;
  const activeAutomationCount = activeAutomationsResult.success ? activeAutomationsResult.value.total : 0;

  // Count automation-sourced active alerts (alertType starts with 'automation.')
  const automationAlertCount = alertsResult.success
    ? alertsResult.value.data.filter((a) => a.alertType?.startsWith('automation.')).length
    : 0;

  const automationSignalData: AutomationSignalData = {
    activeAutomations:      activeAutomationCount,
    recentFailedExecutions: execCounts?.failed    ?? 0,
    runningExecutions:      execCounts?.running   ?? 0,
    activeAutomationAlerts: automationAlertCount,
    pendingAutomationTasks: summaryResult.success ? summaryResult.value.pendingTasks : 0,
  };

  const recentTasks = tasksResult.success ? tasksResult.value.data : [];

  return (
    <>
      <Header breadcrumbs={[{ label: 'Dashboard' }]} />
      <div className="p-6 space-y-6">
        <h1 className="sr-only">Dashboard</h1>
        {/* KPI Cards */}
        {summaryError && (
          <RepositoryErrorState message="No se pudo cargar el resumen del dashboard." />
        )}
        {summary && <AgencySummaryCards summary={summary} />}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Alertas activas */}
          <ActiveAlertsSidebar alerts={recentAlerts} />

          {/* Tareas recientes */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Tareas recientes</h2>
              <Link
                href="/tasks"
                className="text-xs text-red-600 hover:text-red-700 transition-colors"
              >
                Ver todas →
              </Link>
            </div>
            {recentTasks.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400">
                <div className="text-3xl mb-2" aria-hidden="true">
                  📋
                </div>
                <p className="text-sm font-medium text-gray-600">Sin tareas recientes</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100" aria-label="Tareas recientes">
                {recentTasks.map((task: (typeof recentTasks)[number]) => (
                  <li key={task.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      {task.dueDate && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Vence:{' '}
                          {new Date(task.dueDate).toLocaleDateString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">
                        {PRIORITY_LABELS[task.priority] ?? task.priority}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${TASK_STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-700'}`}
                      >
                        {TASK_STATUS_LABELS[task.status] ?? task.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Automatizaciones — señales operativas (Phase 6F) */}
          <AutomationSignalsWidget data={automationSignalData} />

          {/* Accesos rápidos */}
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { href: '/clients',     label: 'Clientes',        icon: '👥' },
              { href: '/alerts',      label: 'Alertas',         icon: '🔔' },
              { href: '/tasks',       label: 'Tareas',          icon: '📋' },
              { href: '/automations', label: 'Automatizaciones', icon: '⚙️' },
            ].map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center gap-2 hover:border-red-300 hover:shadow-sm transition-all"
              >
                <span className="text-2xl" aria-hidden="true">
                  {icon}
                </span>
                <span className="text-sm font-medium text-gray-700">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
