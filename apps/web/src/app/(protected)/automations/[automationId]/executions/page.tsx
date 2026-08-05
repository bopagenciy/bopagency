import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { ExecutionsTable } from '@/components/automations/ExecutionsTable';
import { Pagination } from '@/components/common/Pagination';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAutomationComposition } from '@/lib/composition/automation.composition';
import type { OrganizationId, AutomationId, AutomationExecutionStatus } from '@bop-agency/domain';

export const metadata: Metadata = { title: 'Ejecuciones' };

const VALID_STATUSES: AutomationExecutionStatus[] = [
  'queued', 'running', 'succeeded', 'failed', 'cancelled', 'retrying',
];

type Props = {
  params: Promise<{ automationId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function AutomationExecutionsPage({ params, searchParams }: Props) {
  const { automationId } = await params;
  const { organization, membership } = await requireOrganization();
  const queryParams = await searchParams;

  const statusParam = queryParams.status;
  const status: AutomationExecutionStatus | undefined =
    statusParam && VALID_STATUSES.includes(statusParam as AutomationExecutionStatus)
      ? (statusParam as AutomationExecutionStatus)
      : undefined;
  const page = Math.max(1, parseInt(queryParams.page ?? '1', 10));
  const pageSize = 20;

  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);
  const orgId = organization.id as OrganizationId;

  // Fetch automation name for breadcrumbs
  const automationResult = await useCases.getAutomation({
    automationId: automationId as AutomationId,
    organizationId: orgId,
  });
  if (!automationResult.success && automationResult.error.code === 'NOT_FOUND') notFound();

  const automationName = automationResult.success ? automationResult.value.name : automationId;
  const maxAttempts = automationResult.success
    ? automationResult.value.retryPolicy.maxAttempts
    : 3;

  const executionsResult = await useCases.listExecutions({
    organizationId: orgId,
    automationId: automationId as AutomationId,
    ...(status && { status }),
    pagination: { page, pageSize },
  });

  const executions = executionsResult.success ? executionsResult.value.data : [];
  const total = executionsResult.success ? executionsResult.value.total : 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <Header
        breadcrumbs={[
          { label: 'Automatizaciones', href: '/automations' },
          { label: automationName, href: `/automations/${automationId}` },
          { label: 'Ejecuciones' },
        ]}
      />
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Ejecuciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Historial de ejecuciones para <span className="font-medium">{automationName}</span>.
          </p>
        </div>

        {!executionsResult.success ? (
          <RepositoryErrorState message="No se pudieron cargar las ejecuciones." />
        ) : (
          <>
            <div aria-live="polite" aria-atomic="true">
              <ExecutionsTable
                executions={executions}
                maxAttempts={maxAttempts}
                userRole={membership.role}
              />
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              itemLabel="ejecución"
            />
          </>
        )}
      </div>
    </>
  );
}
