/**
 * CampaignActivationRepository — contrato de dominio agregado para
 * `campaign_activations` + `campaign_activation_targets` +
 * `campaign_activation_events` (Phase 8A.1).
 *
 * Repositorio ÚNICO y AGREGADO (no 3 repositorios separados) — decisión
 * explícita del kickoff de 8A.1 §19: la activation, sus targets y su log de
 * eventos son un solo aggregate boundary gobernado por `activationId`, y un
 * repositorio agregado evita "repository explosion" sin perder cohesión.
 *
 * NO expone ningún método para actualizar `approvedSnapshot` — el snapshot
 * es inmutable por diseño (ver campaign-activation.ts). NO expone ningún
 * método de creación automática desde `Campaign` — `create()` recibe el
 * snapshot ya construido por el caller (application layer, Phase 8A.2).
 *
 * Las transiciones de status (prepare/ready/publish/cancel) están
 * respaldadas por RPCs `SECURITY DEFINER` en la migración — ver
 * 20260824180000_phase8a1_campaign_activation_domain.sql SECCIÓN F. Los
 * métodos de este contrato que las invocan (`prepareTarget`,
 * `markTargetReady`, `markTargetPublished`, `cancelTarget`, `cancel`)
 * DEBEN implementarse en infraestructura llamando exclusivamente a esas
 * RPCs, nunca con un UPDATE directo — mismo criterio que
 * `CampaignRepository.approve`/`reject` (Phase 7C).
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { OrganizationId } from '../entities/organization';
import type { CampaignId } from '../entities/campaign';
import type {
  CampaignActivation,
  CampaignActivationId,
  CampaignActivationFilter,
  CreateCampaignActivationInput,
} from '../entities/campaign-activation';
import type {
  CampaignActivationTarget,
  CampaignActivationTargetId,
  CreateActivationTargetInput,
} from '../entities/campaign-activation-target';
import type { CampaignActivationEvent } from '../entities/campaign-activation-event';

// ─── Aggregate read type ────────────────────────────────────────────────────

export type CampaignActivationWithTargets = CampaignActivation & {
  readonly targets: CampaignActivationTarget[];
};

// ─── Repository interface ─────────────────────────────────────────────────────

export interface CampaignActivationRepository {
  // ── Activation — reads ──────────────────────────────────────────────────────

  findById(id: CampaignActivationId, organizationId: OrganizationId): Promise<Result<CampaignActivation>>;

  findByIdWithTargets(
    id: CampaignActivationId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivationWithTargets>>;

  /** Activation NO-terminal más reciente de una campaña, o null si no hay ninguna. */
  findActiveByCampaign(
    campaignId: CampaignId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivation | null>>;

  findByCampaign(
    campaignId: CampaignId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignActivation>>;

  findByOrganization(
    filter: CampaignActivationFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignActivation>>;

  // ── Activation — writes ─────────────────────────────────────────────────────

  /**
   * INSERT directo (no RPC) — autorizado por RLS + el trigger
   * `check_activation_source` (verifica campaign.status = 'approved' y que
   * campaignApprovalId sea una aprobación real de esa campaña). Ver nota de
   * diseño en el kickoff §14: la migración deja la persistencia lista, el
   * use case SEGURO que arma el `CreateCampaignActivationInput` (snapshot
   * incluido) es responsabilidad de application (Phase 8A.2) — este método
   * es el punto de persistencia, no de orquestación de negocio.
   */
  create(input: CreateCampaignActivationInput): Promise<Result<CampaignActivation>>;

  /** RPC `cancel_campaign_activation` — cancela la activation y en cascada sus targets no-terminales. */
  cancel(
    id: CampaignActivationId,
    organizationId: OrganizationId,
    actorUserId: string,
    reason: string,
  ): Promise<Result<CampaignActivation>>;

  // ── Targets ────────────────────────────────────────────────────────────────

  listTargets(
    activationId: CampaignActivationId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivationTarget[]>>;

  findTargetById(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivationTarget>>;

  addTarget(input: CreateActivationTargetInput): Promise<Result<CampaignActivationTarget>>;

  /** DELETE físico — solo mientras la activation padre sigue 'pending' (reforzado por trigger). */
  removeTarget(id: CampaignActivationTargetId, organizationId: OrganizationId): Promise<Result<void>>;

  /** RPC `prepare_activation_target` — pending → preparing. */
  prepareTarget(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
    actorUserId: string,
    checklist?: Record<string, unknown> | null,
  ): Promise<Result<CampaignActivationTarget>>;

  /** RPC `mark_activation_target_ready` — preparing → ready. */
  markTargetReady(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
    actorUserId: string,
  ): Promise<Result<CampaignActivationTarget>>;

  /** RPC `mark_activation_target_published` — ready|scheduled → published. Camino manual de primera clase. */
  markTargetPublished(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
    actorUserId: string,
    externalReference?: string | null,
    note?: string | null,
  ): Promise<Result<CampaignActivationTarget>>;

  /** RPC `cancel_activation_target` — cancela un target individual. */
  cancelTarget(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
    actorUserId: string,
    reason: string,
  ): Promise<Result<CampaignActivationTarget>>;

  // ── Events (solo lectura — escritura exclusiva vía triggers/RPCs) ──────────

  listEvents(
    activationId: CampaignActivationId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignActivationEvent>>;
}
