import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { MetricsTable } from '@/components/metrics/MetricsTable';
import { MetricsFilters } from '@/components/metrics/MetricsFilters';
import { MetricsSummaryCards } from '@/components/metrics/MetricsSummaryCards';
import { Pagination } from '@/components/common/Pagination';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDashboardComposition } from '@/lib/composition/dashboard.composition';
import type { OrganizationId } from '@bop-agency/domain';
import type { MetricPlatform } from '@bop-agency/shared';
import { METRIC_PLATFORMS } from '@bop-agency/shared';

export const metadata: Metadata = { title: 'Métricas' };

type Props = {
  searchParams: Promise<Record<string, string | undefined>>;
};

function validateEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Parsea "YYYY-MM" a { periodStart: Date, periodEnd: Date } */
function parsePeriod(value: string | undefined): {
  periodStart: Date | undefined;
  periodEnd: Date | undefined;
} {
  if (!value) return { periodStart: undefined, periodEnd: undefined };
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return { periodStart: undefined, periodEnd: undefined };
  const year = parseInt(match[1] ?? '0', 10);
  const month = parseInt(match[2] ?? '1', 10) - 1; // 0-based
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59); // último día del mes
  return { periodStart: start, periodEnd: end };
}

export default async function MetricsPage({ searchParams }: Props) {
  const { organization } = await requireOrganization();
  const params = await searchParams;

  const platform = validateEnum(params.platform, METRIC_PLATFORMS);
  const { periodStart, periodEnd } = parsePeriod(params.period);
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const pageSize = 20;

  const supabase = await createServerSupabaseClient();
  const { repositories, useCases } = createDashboardComposition(supabase);
  const orgId = organization.id as OrganizationId;

  // Obtener períodos disponibles para el selector
  const periodsResult = await repositories.metricsRepository.getAvailablePeriods(orgId);
  const availablePeriods = periodsResult.success ? periodsResult.value : [];

  const periodOptions = availablePeriods.map((p) => {
    const label = p.periodStart.toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
    });
    const value = `${p.periodStart.getFullYear()}-${String(p.periodStart.getMonth() + 1).padStart(2, '0')}`;
    return { label, value };
  });

  // Listar métricas con filtros aplicados
  const metricsResult = await useCases.listClientMetrics({
    organizationId: orgId,
    ...(platform !== undefined && { platform: platform as MetricPlatform }),
    ...(periodStart !== undefined && { periodStart }),
    ...(periodEnd !== undefined && { periodEnd }),
    pagination: { page, pageSize },
  });

  const metrics = metricsResult.success ? metricsResult.value.data : [];
  const total = metricsResult.success ? metricsResult.value.total : 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <Header breadcrumbs={[{ label: 'Métricas' }]} />
      <main className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Métricas</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Rendimiento de campañas por plataforma y período.
            </p>
          </div>
          <MetricsFilters
            platform={params.platform ?? ''}
            period={params.period ?? ''}
            periodOptions={periodOptions}
          />
        </div>

        {!metricsResult.success && (
          <RepositoryErrorState message="No se pudieron cargar las métricas. Intenta recargar la página." />
        )}

        {metricsResult.success && (
          <>
            <MetricsSummaryCards metrics={metrics} />
            <div aria-live="polite" aria-atomic="true">
              <MetricsTable metrics={metrics} />
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              itemLabel="métrica"
            />
          </>
        )}
      </main>
    </>
  );
}
