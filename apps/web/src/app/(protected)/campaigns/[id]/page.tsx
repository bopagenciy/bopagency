import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { CampaignStatusBadge } from '@/components/campaigns/CampaignStatusBadge';
import { CampaignApprovalPanel } from '@/components/campaigns/CampaignApprovalPanel';
import { CampaignActivationEntryCard } from '@/components/activations/CampaignActivationEntryCard';
import { CampaignAutomationActivity } from '@/components/campaigns/CampaignAutomationActivity';
import { EditCampaignModal } from '@/components/campaigns/EditCampaignModal';
import { RegenerateContentButton } from '@/components/campaigns/RegenerateContentButton';
import { GeneratedContentView } from '@/components/campaigns/GeneratedContentView';
import { ComplianceReview } from '@/components/campaigns/ComplianceReview';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCampaignComposition } from '@/lib/composition/campaign.composition';
import { createActivationComposition } from '@/lib/composition/activation.composition';
import { ACTIVATION_TERMINAL_STATUSES } from '@bop-agency/shared';
import type { ActivationStatus } from '@bop-agency/shared';
import { OBJECTIVE_LABELS } from '@/lib/campaign-labels';
import { PLATFORM_LABELS, isAIProviderId } from '@bop-agency/shared';
import type { AdPlatform, AIProviderId } from '@bop-agency/shared';
import type { OrganizationId, CampaignId, Task } from '@bop-agency/domain';
import { buildCampaignTaskSignatureTag } from '@bop-agency/application';
import type { CampaignAutomationType } from '@bop-agency/application';

export const metadata: Metadata = { title: 'Detalle de campaña' };

/**
 * Phase 7D.1 — proveedor de IA con el que se generó el contenido actual.
 * `campaign.metadata` es JSON libre, así que el valor se valida con
 * `isAIProviderId` en lugar de castearse: un valor viejo o corrupto debe
 * comportarse como "sin proveedor conocido", no romper el render.
 */
function readCampaignAiProvider(metadata: Record<string, unknown>): AIProviderId | null {
  const ai = metadata['ai'];
  if (ai === null || typeof ai !== 'object' || Array.isArray(ai)) return null;
  const value = (ai as Record<string, unknown>)['provider'];
  return isAIProviderId(value) ? value : null;
}

function formatBudget(budget: number, currency: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(budget);
}

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Phase 7F — mapea el status ACTUAL de la campaña al tipo de automatización
 * cuya tarea activa (si existe) es relevante mostrar. `draft` no tiene
 * automatización asociada (ningún evento de Phase 7F se dispara ahí).
 * `approved`/`active`/`paused`/`completed` comparten el mismo evento
 * ('campaign_approved') porque la tarea de preparación se crea una sola vez,
 * en el momento de la aprobación, y sigue siendo relevante mientras exista.
 */
function automationTypeForStatus(status: string): CampaignAutomationType | null {
  switch (status) {
    case 'review':
      return 'campaign_review_requested';
    case 'rejected':
      return 'campaign_rejected';
    case 'approved':
    case 'active':
    case 'paused':
    case 'completed':
      return 'campaign_approved';
    default:
      return null;
  }
}

const APPROVAL_ACTION_LABELS: Record<string, string> = {
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

type Props = { params: Promise<{ id: string }> };

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params;
  const { organization, membership, user } = await requireOrganization();

  const supabase = await createServerSupabaseClient();
  const { useCases, repositories } = createCampaignComposition(supabase);
  const orgId = organization.id as OrganizationId;
  const campaignId = id as CampaignId;

  const campaignResult = await useCases.getCampaign({ campaignId, organizationId: orgId });

  if (!campaignResult.success) {
    if (campaignResult.error.code === 'NOT_FOUND') notFound();
    return (
      <>
        <Header breadcrumbs={[{ label: 'Campañas', href: '/campaigns' }, { label: 'Detalle' }]} />
        <div className="p-6 max-w-5xl mx-auto">
          <RepositoryErrorState message="No se pudo cargar la campaña." />
        </div>
      </>
    );
  }

  const campaign = campaignResult.value;

  const [approvalsResult, complianceResult, clientRow] = await Promise.all([
    useCases.listCampaignApprovals({ campaignId, organizationId: orgId }),
    useCases.evaluateCampaignCompliance({ campaignId, organizationId: orgId }),
    supabase.from('clients').select('id, name').eq('id', campaign.clientId).maybeSingle(),
  ]);

  const approvals = approvalsResult.success ? approvalsResult.value : [];
  const compliance = complianceResult.success ? complianceResult.value : null;
  const clientName = clientRow.data?.name ?? '—';

  // Phase 7F — best-effort, solo lectura: si el status actual tiene un tipo
  // de automatización asociado, busca la tarea ACTIVA correspondiente (si
  // existe) para mostrarla en "Actividad / Automatización". Un fallo aquí
  // NUNCA rompe el render del detalle de campaña (mismo criterio best-effort
  // que el resto de Phase 7F).
  const relevantAutomationType = automationTypeForStatus(campaign.status);
  let automationTask: Task | null = null;
  if (relevantAutomationType) {
    const tag = buildCampaignTaskSignatureTag(orgId, campaignId, relevantAutomationType);
    const taskLookup = await repositories.taskRepository
      .findActiveBySignatureTag(tag, orgId)
      .catch(() => null);
    if (taskLookup?.success && taskLookup.value.length > 0) {
      automationTask = taskLookup.value[0] ?? null;
    }
  }


  // Phase 8A.3 — best-effort, solo lectura: activación NO-terminal más
  // reciente (si existe) para mostrar el entry point de activación. Un
  // fallo aquí NUNCA rompe el render del detalle de campaña (mismo
  // criterio best-effort que automationTask arriba, Phase 7F).
  let activeActivationSummary: { id: string; status: ActivationStatus } | null = null;
  let hasAnyActivation = false;
  try {
    const { useCases: activationUseCases } = createActivationComposition(supabase);
    const activationsResult = await activationUseCases.listCampaignActivationsByCampaign({
      campaignId,
      organizationId: orgId,
      actorUserId: user.id,
      pagination: { page: 1, pageSize: 5 },
    });
    if (activationsResult.success) {
      hasAnyActivation = activationsResult.value.total > 0;
      const nonTerminal = activationsResult.value.data.find(
        (a) => !ACTIVATION_TERMINAL_STATUSES.includes(a.status),
      );
      if (nonTerminal) {
        activeActivationSummary = { id: nonTerminal.id, status: nonTerminal.status };
      }
    }
  } catch {
    // best-effort — la sección de activación simplemente no se muestra.
  }

  return (
    <>
      <Header
        breadcrumbs={[
          { label: 'Campañas', href: '/campaigns' },
          { label: campaign.name },
        ]}
      />

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Info card */}
        <div className="bg-card text-card-foreground rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">{campaign.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">Cliente: {clientName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <EditCampaignModal campaign={campaign} userRole={membership.role} />
              <CampaignStatusBadge status={campaign.status} />
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Plataforma</dt>
              <dd className="mt-1 font-medium text-foreground">
                {PLATFORM_LABELS[campaign.platform as AdPlatform] ?? campaign.platform}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Objetivo</dt>
              <dd className="mt-1 font-medium text-foreground">
                {OBJECTIVE_LABELS[campaign.objective] ?? campaign.objective}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Presupuesto</dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatBudget(campaign.budget, campaign.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Vigencia</dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}
              </dd>
            </div>
          </dl>

          {campaign.brief && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Brief</h3>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{campaign.brief}</p>
            </div>
          )}
        </div>

        {/* Approval workflow */}
        <CampaignApprovalPanel campaign={campaign} userRole={membership.role} />

        {/* Phase 8A.3 — Activación manual (nunca publicación externa) */}
        <CampaignActivationEntryCard
          campaignId={campaign.id}
          campaignStatus={campaign.status}
          userRole={membership.role}
          activeActivation={activeActivationSummary}
          hasAnyActivation={hasAnyActivation}
        />

        {/* Phase 7F — Automatización interna (nunca publicación externa) */}
        <CampaignAutomationActivity task={automationTask} />

        {/* Generated content */}
        <div className="bg-card text-card-foreground rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Contenido generado</h2>
            <RegenerateContentButton
              campaignId={campaign.id}
              status={campaign.status}
              userRole={membership.role}
              currentProvider={readCampaignAiProvider(campaign.metadata)}
            />
          </div>
          <GeneratedContentView content={campaign.generatedContent} />
        </div>

        {/* Compliance */}
        <div className="bg-card text-card-foreground rounded-lg border border-border p-6 space-y-3">
          <h2 className="font-semibold text-foreground">Revisión de compliance</h2>
          <ComplianceReview evaluation={compliance} />
        </div>

        {/* Audit trail */}
        {approvals.length > 0 && (
          <div className="bg-card text-card-foreground rounded-lg border border-border p-6 space-y-3">
            <h2 className="font-semibold text-foreground">Historial de decisiones</h2>
            <ul className="space-y-3">
              {approvals.map((approval) => (
                <li key={approval.id} className="text-sm border-l-2 border-border pl-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {APPROVAL_ACTION_LABELS[approval.action] ?? approval.action}
                    </span>
                    <span className="text-muted-foreground text-xs">{formatDate(approval.createdAt)}</span>
                  </div>
                  {approval.note && <p className="text-muted-foreground mt-0.5">{approval.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
