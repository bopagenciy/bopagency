import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { CampaignsTable } from '@/components/campaigns/CampaignsTable';
import { CampaignsFilters } from '@/components/campaigns/CampaignsFilters';
import { Pagination } from '@/components/common/Pagination';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCampaignComposition } from '@/lib/composition/campaign.composition';
import { CAMPAIGN_STATUSES, AD_PLATFORMS } from '@bop-agency/shared';
import type { CampaignStatus, AdPlatform } from '@bop-agency/shared';
import type { OrganizationId } from '@bop-agency/domain';

export const metadata: Metadata = { title: 'Campañas' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function CampaignsPage({ searchParams }: Props) {
  const { organization } = await requireOrganization();
  const params = await searchParams;

  const statusParam = params.status;
  const status: CampaignStatus | undefined =
    statusParam && (CAMPAIGN_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as CampaignStatus)
      : undefined;

  const platformParam = params.platform;
  const platform: AdPlatform | undefined =
    platformParam && (AD_PLATFORMS as readonly string[]).includes(platformParam)
      ? (platformParam as AdPlatform)
      : undefined;

  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const pageSize = 20;

  const supabase = await createServerSupabaseClient();
  const { useCases } = createCampaignComposition(supabase);
  const orgId = organization.id as OrganizationId;

  const result = await useCases.listCampaigns({
    filter: {
      organizationId: orgId,
      ...(status && { status }),
      ...(platform && { platform }),
    },
    pagination: { page, pageSize },
  });

  const campaigns = result.success ? result.value.data : [];
  const total = result.success ? result.value.total : 0;
  const totalPages = Math.ceil(total / pageSize);

  // Nombres de cliente para la tabla — una sola consulta liviana (id, name),
  // sin pasar por el composition root de clients (no existe uno dedicado,
  // ver ClientsPage — que consulta Supabase directamente por el mismo motivo).
  const clientIds = Array.from(new Set(campaigns.map((c) => c.clientId)));
  const clientNames: Record<string, string> = {};
  if (clientIds.length > 0) {
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id, name')
      .in('id', clientIds);
    for (const row of clientRows ?? []) {
      clientNames[row.id as string] = row.name as string;
    }
  }

  return (
    <>
      <Header
        breadcrumbs={[{ label: 'Campañas' }]}
        actions={
          <Link
            href="/campaigns/new"
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors"
          >
            + Nueva campaña
          </Link>
        }
      />
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Campaign Studio</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Crea, revisa y aprueba campañas de Meta, Google y otras plataformas — con asistencia de IA.
            </p>
          </div>
          <CampaignsFilters status={params.status ?? ''} platform={params.platform ?? ''} />
        </div>

        {!result.success && (
          <RepositoryErrorState message="No se pudieron cargar las campañas. Intenta recargar la página." />
        )}

        {result.success && (
          <>
            <div aria-live="polite" aria-atomic="true">
              <CampaignsTable campaigns={campaigns} clientNames={clientNames} />
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              itemLabel="campaña"
            />
          </>
        )}
      </div>
    </>
  );
}
