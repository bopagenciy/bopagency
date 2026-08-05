import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { AutomationStatusBadge } from '@/components/automations/AutomationStatusBadge';
import { AutomationActions } from '@/components/automations/AutomationActions';
import { ExecutionsTable } from '@/components/automations/ExecutionsTable';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAutomationComposition } from '@/lib/composition/automation.composition';
import type { OrganizationId, AutomationId } from '@bop-agency/domain';

export const metadata: Metadata = { title: 'Detalle de automatización' };

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  schedule: 'Programada',
  webhook: 'Webhook',
  event: 'Evento',
};

type Props = { params: Promise<{ automationId: string }> };

export default async function AutomationDetailPage({ params }: Props) {
  const { automationId } = await params;
  const { organization, membership } = await requireOrganization();

  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);
  const orgId = organization.id as OrganizationId;

  const [automationResult, executionsResult] = await Promise.all([
    useCases.getAutomation({
      automationId: automationId as AutomationId,
      organizationId: orgId,
    }),
    useCases.listExecutions({
      organizationId: orgId,
      automationId: automationId as AutomationId,
      pagination: { page: 1, pageSize: 10 },
    }),
  ]);

  if (!automationResult.success) {
    if (automationResult.error.code === 'NOT_FOUND') notFound();
    return (
      <RepositoryErrorState message="No se pudo cargar la automatización." />
    );
  }

  const automation = automationResult.value;
  const recentExecutions = executionsResult.success ? executionsResult.value.data : [];
  const totalExecutions = executionsResult.success ? executionsResult.value.total : 0;

  return (
    <>
      <Header
        breadcrumbs={[
          { label: 'Automatizaciones', href: '/automations' },
          { label: automation.name },
        ]}
        actions={
          <AutomationActions automation={automation} userRole={membership.role} />
        }
      />

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Info card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{automation.name}</h1>
              {automation.description && (
                <p className="text-sm text-gray-500 mt-1">{automation.description}</p>
              )}
            </div>
            <AutomationStatusBadge status={automation.status} />
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide">Tipo de trigger</dt>
              <dd className="mt-1 font-medium text-gray-800">
                {TRIGGER_LABELS[automation.triggerConfig.type] ?? automation.triggerConfig.type}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide">Máx. reintentos</dt>
              <dd className="mt-1 font-medium text-gray-800">
                {automation.retryPolicy.maxAttempts}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide">Workflow n8n</dt>
              <dd className="mt-1 font-medium text-gray-800 truncate">
                {automation.n8nWorkflowId ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 text-xs uppercase tracking-wide">Actualizada</dt>
              <dd className="mt-1 font-medium text-gray-800">
                {new Date(automation.updatedAt).toLocaleDateString('es-CO', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </dd>
            </div>
          </dl>
        </div>

        {/* Recent executions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Ejecuciones recientes
              {totalExecutions > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">({totalExecutions} total)</span>
              )}
            </h2>
            <Link
              href={`/automations/${automationId}/executions`}
              className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Ver todas →
            </Link>
          </div>

          {!executionsResult.success ? (
            <RepositoryErrorState message="No se pudieron cargar las ejecuciones." />
          ) : (
            <ExecutionsTable
              executions={recentExecutions}
              maxAttempts={automation.retryPolicy.maxAttempts}
              userRole={membership.role}
            />
          )}
        </div>
      </div>
    </>
  );
}
