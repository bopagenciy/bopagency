/**
 * createCampaignActivation — Phase 8A.2.
 *
 * El ÚNICO punto autorizado para construir un `CampaignActivationSnapshot`
 * real (a partir de una `Campaign`/`CampaignApproval` reales) e invocar
 * `CampaignActivationRepository.create()` — ver
 * docs/implementation/phase-8/PHASE_8A1_ACTIVATION_DOMAIN_PERSISTENCE_REPORT.md
 * §25 y el kickoff de 8A.2 §1.A.
 *
 * REGLA CRÍTICA DE PRODUCTO — NUNCA AUTOMÁTICO:
 * Ningún otro use case (en particular `approveCampaign`) llama a este use
 * case. La creación de una activation es SIEMPRE una acción explícita del
 * usuario — "approval != publication" (audit §2), y ahora también
 * "approval != activation". Ver también R-ACT-13 en el risk register.
 *
 * Defensa en profundidad (mismo criterio que `approveCampaign` re-verificando
 * la transición pese al trigger de BD, y que `createCampaignDraft`
 * re-verificando el cliente pese al trigger):
 * 1. Rol mínimo strategist (matriz de roles §2 del kickoff — "strategist:
 *    may create/configure activation"; el operator NO puede crear).
 * 2. Se carga la Campaign real (aislada por organización) y se verifica
 *    `campaign.status === 'approved'` en application ANTES de construir el
 *    snapshot — el trigger `check_activation_source` de la migración
 *    vuelve a verificar exactamente lo mismo dentro de la misma
 *    transacción del INSERT; esta capa solo evita un roundtrip fallido y
 *    da un error tipado amigable.
 * 3. Se resuelve la ÚLTIMA decisión real de `campaign_approvals` para esta
 *    campaña y se verifica que sea `action === 'approved'` — nunca se
 *    fabrica un `campaignApprovalId`. Si la campaña está `approved` pero
 *    su última decisión no lo fuera (estado inconsistente, no debería
 *    poder ocurrir dado el workflow de Phase 7C), se falla explícito en
 *    vez de adivinar.
 * 4. El snapshot se construye con el `CampaignActivationSnapshot` tipado
 *    de dominio y se valida con `campaignActivationSnapshotSchema` (Zod,
 *    shared) ANTES de llamar al repositorio — mismo patrón que
 *    `campaignGeneratedContentSchema` en `generateCampaignDraftWithAI`.
 * 5. El repositorio de infraestructura hace el INSERT directo (no RPC) —
 *    protegido por RLS + el trigger `check_activation_source`, que es la
 *    autoridad final (revalida todo lo de arriba dentro de la transacción,
 *    incluida la invariante de tenencia organization_id/client_id que esta
 *    capa NO revalida por separado porque el snapshot/Campaign ya vienen
 *    aislados por `organizationId` desde `findById`).
 * 6. POST-COMMIT, best-effort: `evalActivationCreatedSignalSilently` crea
 *    una tarea operativa de siguiente-paso — nunca revierte la creación ya
 *    confirmada si falla.
 *
 * NUNCA transiciona `campaign.status` a `active` — la activation tiene un
 * lifecycle propio, completamente separado (ver campaign-activation.ts).
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import {
  campaignActivationSnapshotSchema,
  campaignGeneratedContentSchema,
  createCampaignActivationSchema,
} from '@bop-agency/shared';
import type {
  CampaignActivation,
  CampaignActivationRepository,
  CampaignApprovalRepository,
  CampaignRepository,
  OrganizationRepository,
  TaskRepository,
  AlertRepository,
  CampaignId,
  OrganizationId,
} from '@bop-agency/domain';
import {
  hasMinimumRole,
  insufficientRole,
  notOrganizationMember,
  campaignNotApprovedForActivation,
  activationApprovalMismatch,
} from '@bop-agency/domain';
import type { CampaignActivationSnapshot } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';
import { evalActivationCreatedSignalSilently } from './activation-signals';

export type CreateCampaignActivationInput = {
  readonly campaignId: string;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown>;
};

export type CreateCampaignActivationDeps = {
  campaignRepository: CampaignRepository;
  campaignApprovalRepository: CampaignApprovalRepository;
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  /** Phase 8A.2 — opcionales para no romper callers/tests preexistentes que no los pasen. */
  alertRepository?: AlertRepository;
  taskRepository?: TaskRepository;
  logger: LoggerPort;
};

export async function createCampaignActivation(
  input: CreateCampaignActivationInput,
  deps: CreateCampaignActivationDeps,
): Promise<Result<CampaignActivation>> {
  deps.logger.debug('createCampaignActivation', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = createCampaignActivationSchema.safeParse({
    campaignId: input.campaignId,
    notes: input.notes,
    metadata: input.metadata,
  });
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const campaignId = parsed.data.campaignId as CampaignId;

  // 1. Rol mínimo: strategist+ (viewer/operator denegados).
  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }
  if (!hasMinimumRole(memberResult.value.role, 'strategist')) {
    return err(insufficientRole('strategist', memberResult.value.role));
  }

  // 2. Cargar la campaña real (aislada por organización).
  const campaignResult = await deps.campaignRepository.findById(campaignId, input.organizationId);
  if (!isOk(campaignResult)) {
    return campaignResult;
  }
  const campaign = campaignResult.value;

  // 3. Verificar campaign.status === 'approved' EN APPLICATION (defensa en
  //    profundidad — el trigger de BD vuelve a verificarlo).
  if (campaign.status !== 'approved') {
    return err(campaignNotApprovedForActivation(String(campaign.id), campaign.status));
  }

  // 4. Resolver la aprobación REAL — nunca fabricar un campaignApprovalId.
  const approvalResult = await deps.campaignApprovalRepository.findLatestByCampaignId(
    campaignId,
    input.organizationId,
  );
  if (!isOk(approvalResult)) {
    return approvalResult;
  }
  const latestApproval = approvalResult.value;
  if (!latestApproval || latestApproval.action !== 'approved') {
    return err(activationApprovalMismatch(latestApproval ? String(latestApproval.id) : 'none'));
  }

  // 5. Construir el snapshot inmutable a partir de la Campaign/CampaignApproval reales.
  //
  // generatedContent: el schema Zod de campaignGeneratedContent es estricto
  // (discriminated union por platform). Si `campaign.generatedContent` ya
  // existe (Phase 7D) y matchea la forma esperada, se congela TAL CUAL
  // estaba aprobado en el snapshot (mismo criterio documentado en
  // `CampaignActivationSnapshot.generatedContent`, domain: "congelado tal
  // cual estaba aprobado, nunca regenerado después del snapshot"). Si no
  // existe (null) o no matchea (dato corrupto/legacy de OTRO subsistema),
  // se congela como `null` en vez de fallar la creación de la activation
  // por un problema ajeno — el contenido crudo real sigue disponible en
  // `campaigns.generated_content` para debugging.
  let snapshotGeneratedContent: CampaignActivationSnapshot['generatedContent'] = null;
  if (campaign.generatedContent) {
    const generatedContentCheck = campaignGeneratedContentSchema.safeParse(campaign.generatedContent);
    if (generatedContentCheck.success) {
      snapshotGeneratedContent = generatedContentCheck.data;
    } else {
      deps.logger.warn('createCampaignActivation: campaign.generatedContent does not match schema — freezing snapshot.generatedContent as null', {
        campaignId: String(campaignId),
        organizationId: input.organizationId,
      });
    }
  }

  const snapshot: CampaignActivationSnapshot = {
    schemaVersion: 'activation-snapshot-v1',
    campaign: {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      platform: campaign.platform,
      budget: campaign.budget,
      currency: campaign.currency,
      startDate: campaign.startDate ? campaign.startDate.toISOString() : null,
      endDate: campaign.endDate ? campaign.endDate.toISOString() : null,
    },
    generatedContent: snapshotGeneratedContent,
    metadata: input.metadata ?? {},
    approval: {
      campaignApprovalId: latestApproval.id,
      approvedAt: latestApproval.createdAt.toISOString(),
      approvedBy: latestApproval.actorUserId,
    },
  };

  const snapshotCheck = campaignActivationSnapshotSchema.safeParse(snapshot);
  if (!snapshotCheck.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: `Snapshot inválido: ${snapshotCheck.error.errors.map((e) => e.message).join('; ')}`,
    });
  }

  // 6. Persistir (INSERT directo, protegido por RLS + trigger).
  const createResult = await deps.activationRepository.create({
    organizationId: input.organizationId,
    clientId: campaign.clientId,
    campaignId,
    campaignApprovalId: latestApproval.id,
    approvedSnapshot: snapshot,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
    createdBy: input.actorUserId,
  });
  if (!isOk(createResult)) {
    deps.logger.error('createCampaignActivation: repository error', { error: createResult });
    return createResult;
  }

  deps.logger.info('createCampaignActivation: ok', {
    activationId: String(createResult.value.id),
    campaignId: String(campaignId),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  // 7. POST-COMMIT, best-effort — nunca revierte la creación ya confirmada.
  await evalActivationCreatedSignalSilently(
    {
      organizationId: input.organizationId,
      clientId: campaign.clientId,
      campaignId,
      campaignName: campaign.name,
      activationId: createResult.value.id,
      actorUserId: input.actorUserId,
    },
    deps,
  );

  return ok(createResult.value);
}
