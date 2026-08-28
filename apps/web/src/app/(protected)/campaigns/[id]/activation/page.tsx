import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { ActivationSummaryCard } from '@/components/activations/ActivationSummaryCard';
import { ActivationTargetsPanel } from '@/components/activations/ActivationTargetsPanel';
import { CancelActivationPanel } from '@/components/activations/CancelActivationPanel';
import { ActivationEventTimeline } from '@/components/activations/ActivationEventTimeline';
import { CreateActivationPanel } from '@/components/activations/CreateActivationPanel';
import { ActivationStatusBadge } from '@/components/activations/ActivationStatusBadge';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCampaignComposition } from '@/lib/composition/campaign.composition';
import { createActivationComposition } from '@/lib/composition/activation.composition';
import { createPublicationComposition } from '@/lib/composition/publication.composition';
import { PublicationOperationsPanel } from '@/components/publications/PublicationOperationsPanel';
import { canCancelActivation } from '@bop-agency/domain';
import { ACTIVATION_TERMINAL_STATUSES } from '@bop-agency/shared';
import { selectActiveActivation } from '@/lib/activations/select-active-activation';
import type { OrganizationId, CampaignId, CampaignActivationId } from '@bop-agency/domain';

export const metadata: Metadata = { title: 'Activación de campaña' };

type Props = { params: Promise<{ id: string }> };

/**
 * /campaigns/[id]/activation — Phase 8A.3.
 *
 * Vista operativa de activación manual de una campaña aprobada. NO publica
 * nada externamente (Meta/Google/LinkedIn/email) — "marcar publicado" es
 * exclusivamente una confirmación humana de publicación fuera de la
 * plataforma (ver PHASE_8A3_WEB_MANUAL_OPERATIONS_REPORT.md §7).
 *
 * Estructura:
 * A) Resumen de la activación (ActivationSummaryCard).
 * B/C) Canales/targets + operación manual (ActivationTargetsPanel).
 * D) Cancelación de la activación completa (CancelActivationPanel).
 * E) Timeline de eventos (ActivationEventTimeline).
 * Si no existe una activación no-terminal: estado vacío + creación
 * (CreateActivationPanel) + historial de activaciones terminales previas.
 */
export default async function CampaignActivationPage({ params }: Props) {
  const { id } = await params;
  const { organization, membership, user } = await requireOrganization();

  const supabase = await createServerSupabaseClient();
  const { useCases: campaignUseCases } = createCampaignComposition(supabase);
  const { useCases: activationUseCases } = createActivationComposition(supabase);

  const orgId = organization.id as OrganizationId;
  const campaignId = id as CampaignId;

  const campaignResult = await campaignUseCases.getCampaign({ campaignId, organizationId: orgId });
  if (!campaignResult.success) {
    if (campaignResult.error.code === 'NOT_FOUND') notFound();
    return (
      <>
        <Header
          breadcrumbs={[
            { label: 'Campañas', href: '/campaigns' },
            { label: 'Activación' },
          ]}
        />
        <div className="p-6 max-w-5xl mx-auto">
          <RepositoryErrorState message="No se pudo cargar la campaña." />
        </div>
      </>
    );
  }
  const campaign = campaignResult.value;

  const breadcrumbs = [
    { label: 'Campañas', href: '/campaigns' },
    { label: campaign.name, href: `/campaigns/${campaign.id}` },
    { label: 'Activación' },
  ];

  const historyResult = await activationUseCases.listCampaignActivationsByCampaign({
    campaignId,
    organizationId: orgId,
    actorUserId: user.id,
    pagination: { page: 1, pageSize: 20 },
  });

  if (!historyResult.success) {
    return (
      <>
        <Header breadcrumbs={breadcrumbs} />
        <div className="p-6 max-w-5xl mx-auto">
          <RepositoryErrorState message="No se pudieron cargar las activaciones de esta campaña." />
        </div>
      </>
    );
  }

  const activations = historyResult.value.data;
  const { nonTerminal, terminalHistory } = selectActiveActivation(activations);

  // ── Empty / creation state — no non-terminal activation exists ──────────
  if (!nonTerminal) {
    return (
      <>
        <Header breadcrumbs={breadcrumbs} />
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          {activations.length === 0 ? (
            <div
              className="bg-white rounded-xl border border-border p-10 text-center space-y-2"
              data-testid="activation-empty-state"
            >
              <p className="text-base font-semibold text-gray-900">
                Esta campaña todavía no tiene ninguna activación.
              </p>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Una activación abre el flujo operativo de canales y publicaciones manuales para
                una campaña aprobada. No publica nada por sí sola.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border p-6 space-y-3">
              <h2 className="font-semibold text-gray-900">Historial de activaciones</h2>
              <ul className="space-y-2">
                {terminalHistory.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2"
                  >
                    <span className="font-mono text-xs text-gray-500">{a.id}</span>
                    <ActivationStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CreateActivationPanel
            campaignId={campaign.id}
            campaignStatus={campaign.status}
            userRole={membership.role}
            hasNonTerminalActivation={false}
          />
        </div>
      </>
    );
  }

  // ── Active activation — full operational view ────────────────────────────
  const detailResult = await activationUseCases.getActivationWithTargetsAndEvents({
    activationId: nonTerminal.id as CampaignActivationId,
    organizationId: orgId,
    actorUserId: user.id,
    eventsPagination: { page: 1, pageSize: 50 },
  });

  if (!detailResult.success) {
    return (
      <>
        <Header breadcrumbs={breadcrumbs} />
        <div className="p-6 max-w-5xl mx-auto">
          <RepositoryErrorState message="No se pudo cargar el detalle de la activación." />
        </div>
      </>
    );
  }

  const { activation, events } = detailResult.value;

  const { useCases: publicationUseCases } = createPublicationComposition(supabase);
  const jobsResult = await publicationUseCases.listPublicationJobsByActivation({
    activationId: nonTerminal.id as CampaignActivationId,
    organizationId: orgId,
    actorUserId: user.id,
    pagination: { page: 1, pageSize: 50 },
  });

  const publicationJobs = jobsResult.success
    ? jobsResult.value.data.map((j) => ({
        id: j.id,
        targetId: j.targetId,
        channel: j.channel,
        provider: j.provider,
        status: j.status,
        retryCount: j.retryCount,
        retryOfJobId: j.retryOfJobId,
        createdAt: j.createdAt.toISOString(),
      }))
    : [];

  return (
    <>
      <Header breadcrumbs={breadcrumbs} />
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <ActivationSummaryCard
          activation={{
            id: activation.id,
            status: activation.status,
            campaignId: campaign.id,
            campaignApprovalId: activation.campaignApprovalId,
            campaignName: campaign.name,
            scheduledAt: activation.scheduledAt ? activation.scheduledAt.toISOString() : null,
            createdBy: activation.createdBy,
            createdAt: activation.createdAt.toISOString(),
            updatedAt: activation.updatedAt.toISOString(),
            notes: activation.notes,
          }}
        />

        <ActivationTargetsPanel
          campaignId={campaign.id}
          activationId={activation.id}
          activationTerminal={ACTIVATION_TERMINAL_STATUSES.includes(activation.status)}
          userRole={membership.role}
          targets={activation.targets.map((t) => ({
            id: t.id,
            channel: t.channel,
            provider: t.provider,
            placement: t.placement,
            status: t.status,
            clientIntegrationId: t.clientIntegrationId,
            externalReference: t.externalReference,
            publishedAt: t.publishedAt ? t.publishedAt.toISOString() : null,
            createdAt: t.createdAt.toISOString(),
          }))}
        />

        <PublicationOperationsPanel
          campaignId={campaign.id}
          activationId={activation.id}
          userRole={membership.role}
          jobs={publicationJobs}
        />

        <CancelActivationPanel
          campaignId={campaign.id}
          activationId={activation.id}
          userRole={membership.role}
          canCancel={canCancelActivation(activation.status)}
        />

        <ActivationEventTimeline
          events={events.data.map((e) => ({
            id: e.id,
            eventType: e.eventType,
            actorUserId: e.actorUserId,
            isSystem: e.isSystem,
            fromStatus: e.fromStatus,
            toStatus: e.toStatus,
            note: e.note,
            createdAt: e.createdAt.toISOString(),
          }))}
        />

        {terminalHistory.length > 0 && (
          <div className="bg-white rounded-xl border border-border p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">Activaciones anteriores</h2>
            <ul className="space-y-2">
              {terminalHistory.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2"
                >
                  <span className="font-mono text-xs text-gray-500">{a.id}</span>
                  <ActivationStatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
