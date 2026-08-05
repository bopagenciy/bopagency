import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { ExecutionStatusBadge } from '@/components/automations/ExecutionStatusBadge';
import { ExecutionActions } from '@/components/automations/ExecutionActions';
import { ExecutionTimeline } from '@/components/automations/ExecutionTimeline';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAutomationComposition } from '@/lib/composition/automation.composition';
import { SupabaseExecutionLogRepository } from '@bop-agency/infrastructure';
import type { OrganizationId, AutomationExecutionId, AutomationId } from '@bop-agency/domain';

export const metadata: Metadata = { title: 'Detalle de ejecución' };

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  schedule: 'Programada',
  webhook: 'Webhook',
  event: 'Evento',
};

type Props = { params: Promise<{ executionId: string }> };

export default async function ExecutionDetailPage({ params }: Props) {
  const { executionId } = await params;
  const { organization, membership } = await requireOrganization();

  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);
  const logRepo = new SupabaseExecutionLogRepository(supabase);
  const orgId = organization.id as OrganizationId;

  const [executionResult, logsResult] = await Promise.all([
    useCases.getExecution({
      executionId: executionId as AutomationExecutionId,
      organizationId: orgId,
    }),
    logRepo.findByExecution(
      executionId as AutomationExecutionId,
      orgId,
      { page: 1, pageSize: 50 },
    ),
  ]);

  if (!executionResult.success) {
    if (executionResult.error.code === 'NOT_FOUND') notFound();
    return <RepositoryErrorState message="No se pudo cargar la ejecución." />;
  }

  const execution = executionResult.value;
  const logs = logsResult.data;

  // Fetch automation details for breadcrumbs + maxAttempts
  const automationResult = await useCases.getAutomation({
    automationId: execution.automationId as AutomationId,
    organizationId: orgId,
  });
  const automationName = automationResult.success ? automationResult.value.name : execution.automationId;
  const maxAttempts = automationResult.success
    ? automationResult.value.retryPolicy.maxAttempts
    : 3;

  return (
    <>
      <Header
        breadcrumbs={[
          { label: 'Automatizaciones', href: '/automations' },
          { label: automationName, href: `/automations/${execution.automationId}` },
          { label: 'Ejecuciones', href: `/automations/${execution.automationId}/executions` },
          { label: executionId.slice(0, 8) + '…' },
        ]}
        actions={
          <ExecutionActions
            execution={execution}
            maxAttempts={maxAttempts}
            userRole={membership.role}
          />
        }
      />

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Execution info card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 font-mono">
                {executionId}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Intento #{execution.attempt} · {TRIGGER_LABELS[execution.triggerType] ?? execution.triggerType}
              </p>
            </div>
            <ExecutionStatusBadge status={execution.status} />
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide">Iniciada por</dt>
              <dd className="mt-1 font-medium text-gray-800 truncate">{execution.triggeredBy}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide">En cola</dt>
              <dd className="mt-1 font-medium text-gray-800">
                {new Date(execution.queuedAt).toLocaleString('es-CO', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide">Completada</dt>
              <dd className="mt-1 font-medium text-gray-800">
                {execution.completedAt
                  ? new Date(execution.completedAt).toLocaleString('es-CO', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </dd>
            </div>
            {execution.errorCode && (
              <div>
                <dt className="text-gray-400 text-xs uppercase tracking-wide">Error</dt>
                <dd className="mt-1 font-medium text-red-700 truncate">{execution.errorCode}</dd>
              </div>
            )}
          </dl>

          {execution.errorMessage && (
            <div className="bg-red-50 rounded-lg p-3 text-sm text-red-800">
              <span className="font-medium">Mensaje de error:</span> {execution.errorMessage}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Timeline de eventos</h2>
          <ExecutionTimeline logs={logs} />
        </div>
      </div>
    </>
  );
}
