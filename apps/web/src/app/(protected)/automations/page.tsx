import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { AutomationsTable } from '@/components/automations/AutomationsTable';
import { AutomationsFilters } from '@/components/automations/AutomationsFilters';
import { Pagination } from '@/components/common/Pagination';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAutomationComposition } from '@/lib/composition/automation.composition';
import type { OrganizationId, AutomationStatus } from '@bop-agency/domain';

export const metadata: Metadata = { title: 'Automatizaciones' };

const VALID_STATUSES: AutomationStatus[] = ['draft', 'active', 'paused', 'archived'];

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function AutomationsPage({ searchParams }: Props) {
  const { organization, membership } = await requireOrganization();
  const params = await searchParams;

  const statusParam = params.status;
  const status: AutomationStatus | undefined =
    statusParam && VALID_STATUSES.includes(statusParam as AutomationStatus)
      ? (statusParam as AutomationStatus)
      : undefined;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const pageSize = 20;

  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);
  const orgId = organization.id as OrganizationId;

  const result = await useCases.listAutomations({
    organizationId: orgId,
    ...(status && { status }),
    pagination: { page, pageSize },
  });

  const automations = result.success ? result.value.data : [];
  const total = result.success ? result.value.total : 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <Header breadcrumbs={[{ label: 'Automatizaciones' }]} />
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Automatizaciones</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Gestiona el ciclo de vida y ejecuciones de las automatizaciones.
            </p>
          </div>
          <AutomationsFilters status={params.status ?? ''} />
        </div>

        {!result.success && (
          <RepositoryErrorState message="No se pudieron cargar las automatizaciones. Intenta recargar la página." />
        )}

        {result.success && (
          <>
            <div aria-live="polite" aria-atomic="true">
              <AutomationsTable automations={automations} userRole={membership.role} />
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              itemLabel="automatización"
            />
          </>
        )}
      </div>
    </>
  );
}
