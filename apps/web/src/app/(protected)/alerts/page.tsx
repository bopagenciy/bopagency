import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { AlertsTable } from '@/components/alerts/AlertsTable';
import { AlertsFilters } from '@/components/alerts/AlertsFilters';
import { Pagination } from '@/components/common/Pagination';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDashboardComposition } from '@/lib/composition/dashboard.composition';
import type { OrganizationId } from '@bop-agency/domain';
import type { AlertStatus, AlertSeverity } from '@bop-agency/shared';
import { ALERT_STATUSES, ALERT_SEVERITIES } from '@bop-agency/shared';

export const metadata: Metadata = { title: 'Alertas' };

type Props = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/** Valida que un string pertenezca al array de valores permitidos. */
function validateEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export default async function AlertsPage({ searchParams }: Props) {
  const { organization, membership } = await requireOrganization();
  const params = await searchParams;

  // Validar searchParams — nunca confiar en valores arbitrarios
  const status = validateEnum(params.status, ALERT_STATUSES);
  const severity = validateEnum(params.severity, ALERT_SEVERITIES);
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const pageSize = 20;

  const supabase = await createServerSupabaseClient();
  const { useCases } = createDashboardComposition(supabase);
  const orgId = organization.id as OrganizationId;

  const alertsResult = await useCases.listAlerts({
    organizationId: orgId,
    ...(status !== undefined && { status: status as AlertStatus }),
    ...(severity !== undefined && { severity: severity as AlertSeverity }),
    pagination: { page, pageSize },
  });

  const alerts = alertsResult.success ? alertsResult.value.data : [];
  const total = alertsResult.success ? alertsResult.value.total : 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <Header breadcrumbs={[{ label: 'Alertas' }]} />
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Alertas</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Gestiona y responde a las alertas del sistema.
            </p>
          </div>
          <AlertsFilters status={params.status ?? ''} severity={params.severity ?? ''} />
        </div>

        {!alertsResult.success && (
          <RepositoryErrorState message="No se pudieron cargar las alertas. Intenta recargar la página." />
        )}

        {alertsResult.success && (
          <>
            <div aria-live="polite" aria-atomic="true">
              <AlertsTable alerts={alerts} userRole={membership.role} />
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              itemLabel="alerta"
            />
          </>
        )}
      </div>
    </>
  );
}
