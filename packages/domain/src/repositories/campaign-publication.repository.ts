/**
 * CampaignPublicationRepository - contrato de dominio agregado para
 * `campaign_publication_jobs` + `campaign_publication_attempts` +
 * `campaign_publication_events` + `campaign_publication_webhook_events`
 * (Phase 8B.1).
 *
 * Repositorio UNICO y AGREGADO - mismo criterio explicito que
 * `CampaignActivationRepository` (8A.1): job/attempt/event/webhook-event
 * son un solo aggregate boundary gobernado por `jobId`, y separarlos en 4
 * repositorios distintos seria "repository explosion" sin ganar cohesion.
 *
 * TODAS las escrituras de este contrato DEBEN implementarse en
 * infraestructura llamando EXCLUSIVAMENTE a las RPCs `SECURITY DEFINER`
 * de la migracion 20260825120000_phase8b1_publication_domain_persistence.sql
 * SECCION F - nunca un UPDATE/INSERT directo (mismo criterio que
 * `CampaignActivationRepository`/`CampaignRepository.approve`/`reject`).
 *
 * Este contrato NO implementa orquestacion externa (ningun
 * `ChannelPublisherPort`, ninguna llamada HTTP real a un proveedor) - es
 * persistencia pura, consumida por 8B.2 (application orchestration).
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { OrganizationId } from '../entities/organization';
import type { CampaignActivationId } from '../entities/campaign-activation';
import type { CampaignActivationTargetId } from '../entities/campaign-activation-target';
import type {
  CampaignPublicationJob,
  CampaignPublicationJobId,
  CreatePublicationJobInput,
} from '../entities/campaign-publication-job';
import type {
  CampaignPublicationAttempt,
  CampaignPublicationAttemptId,
} from '../entities/campaign-publication-attempt';
import type {
  CampaignPublicationEvent,
  CampaignPublicationEventId,
} from '../entities/campaign-publication-event';
import type {
  CampaignPublicationWebhookEvent,
  RecordWebhookReceiptInput,
  RecordWebhookReceiptResult,
} from '../entities/campaign-publication-webhook-event';
import type { PublicationFailureCategory, PublicationWebhookEventStatus } from '@bop-agency/shared';

// --- Aggregate read type ---

export type CampaignPublicationJobWithAttempts = CampaignPublicationJob & {
  readonly attempts: CampaignPublicationAttempt[];
};

// --- Input types for RPC-backed operations ---

export type StartPublicationJobInput = {
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  /** Override explicito del timeout de reconciliacion - default en @bop-agency/shared si se omite. */
  readonly reconciliationTimeoutMinutes?: number;
};

export type CreatePublicationAttemptInput = {
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  readonly idempotencyKey: string;
};

export type RecordPublicationSuccessInput = {
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  readonly attemptId: CampaignPublicationAttemptId;
  readonly externalId: string;
  readonly externalUrl?: string | null;
  readonly providerStatus?: string | null;
};

export type RecordPublicationFailureInput = {
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  readonly attemptId?: CampaignPublicationAttemptId | null;
  readonly failureCategory: PublicationFailureCategory;
  readonly providerErrorCode?: string | null;
  readonly note?: string | null;
};

export type RecordPublicationUnknownOutcomeInput = {
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  readonly attemptId?: CampaignPublicationAttemptId | null;
  readonly note?: string | null;
};

export type ReconcilePublicationJobInput = {
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  /** 'published' cierra el job a succeeded; 'not_published' lo cierra a failed (retryable) - audit S11.2. */
  readonly outcome: 'published' | 'not_published';
  readonly externalId?: string | null;
  readonly externalUrl?: string | null;
  readonly note: string;
};

/**
 * Input de `prepareRetry` (RPC `prepare_publication_retry`, Run 4 /
 * 20260828100000). `jobId` es el job FALLIDO ORIGINAL (nunca se muta) -
 * el resultado autoriza el reset `failed -> ready` de su target, que hace
 * alcanzable un `createJob({ targetId, retryOfJobId: jobId })` posterior.
 */
export type PrepareRetryInput = {
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly note?: string | null;
};

// --- Repository interface ---

export interface CampaignPublicationRepository {
  // -- Jobs - reads --

  findJobById(
    id: CampaignPublicationJobId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignPublicationJob>>;

  findJobWithAttempts(
    id: CampaignPublicationJobId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignPublicationJobWithAttempts>>;

  /** Job NO-terminal mas reciente de un target, o null - refleja la constraint UNIQUE(target_id) WHERE NOT terminal. */
  findActiveJobByTarget(
    targetId: CampaignActivationTargetId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignPublicationJob | null>>;

  listJobsByActivation(
    activationId: CampaignActivationId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignPublicationJob>>;

  /**
   * Historial COMPLETO (terminal + no-terminal) de jobs de un target,
   * mas reciente primero - Phase 8B.2 (necesario para
   * `listPublicationJobsByTarget`; no existia en el contrato original de
   * 8B.1, que solo exponia `findActiveJobByTarget` para el job no-terminal
   * unico). Lectura pura (SELECT directo con RLS, igual que
   * `listJobsByActivation`) - NO agrega ninguna RPC ni cambia ninguna
   * migracion aplicada.
   */
  listJobsByTarget(
    targetId: CampaignActivationTargetId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignPublicationJob>>;

  // -- Jobs - writes (RPC-backed) --

  /** RPC `create_publication_job` - rol operator+. Crea en 'queued'. */
  createJob(input: CreatePublicationJobInput, actorUserId: string): Promise<Result<CampaignPublicationJob>>;

  /** RPC `claim_publication_job` - service_role/worker unicamente. queued -> claimed. */
  claimJob(
    id: CampaignPublicationJobId,
    organizationId: OrganizationId,
    workerId: string,
  ): Promise<Result<CampaignPublicationJob>>;

  /** RPC `start_publication_job` - service_role/worker unicamente. claimed -> in_progress; transiciona el target padre a 'publishing'. */
  startJob(input: StartPublicationJobInput): Promise<Result<CampaignPublicationJob>>;

  /** RPC `record_publication_attempt` - service_role/worker unicamente. Crea un attempt abierto (S3.1). */
  createAttempt(input: CreatePublicationAttemptInput): Promise<Result<CampaignPublicationAttempt>>;

  /** RPC `mark_publication_job_succeeded` - service_role unicamente. in_progress -> succeeded; target -> published. */
  recordSuccess(input: RecordPublicationSuccessInput): Promise<Result<CampaignPublicationJob>>;

  /** RPC `mark_publication_job_failed` - service_role unicamente. in_progress -> failed; target -> failed. */
  recordFailure(input: RecordPublicationFailureInput): Promise<Result<CampaignPublicationJob>>;

  /**
   * RPC `mark_publication_job_unknown_outcome` - service_role unicamente.
   * in_progress -> unknown_outcome (NO terminal, NUNCA auto-retry). El
   * target permanece 'publishing' mientras se reconcilia (S4.7).
   */
  recordUnknownOutcome(input: RecordPublicationUnknownOutcomeInput): Promise<Result<CampaignPublicationJob>>;

  /**
   * RPC `cancel_publication_job` - operator+ para queued/claimed;
   * strategist+ para in_progress (cooperativo, NO transiciona el estado -
   * ver `canRequestCooperativeCancel`). Rechaza terminal/unknown_outcome.
   */
  cancelJob(
    id: CampaignPublicationJobId,
    organizationId: OrganizationId,
    actorUserId: string,
    reason: string,
  ): Promise<Result<CampaignPublicationJob>>;

  /**
   * RPC `reconcile_publication_job` - strategist+ unicamente (locked
   * decision #1). unknown_outcome -> succeeded | failed. Nunca aplica a
   * ningun otro estado.
   */
  reconcileJob(input: ReconcilePublicationJobInput): Promise<Result<CampaignPublicationJob>>;

  /**
   * RPC `prepare_publication_retry` - strategist+ unicamente (Run 4 /
   * 20260828100000). Unica via autorizada para transicionar el target del
   * job referenciado de `failed` a `ready`, habilitando un
   * `createJob({ targetId, retryOfJobId: jobId })` posterior. Exige que el
   * job este `failed` con una `failureCategory` retryable
   * (`canRetryPublicationJob`) y que el target no tenga ya un job activo.
   * NUNCA muta el job historico referenciado - solo agrega un evento
   * `retry_prepared`. Retorna el `targetId` reseteado.
   */
  prepareRetry(input: PrepareRetryInput): Promise<Result<CampaignActivationTargetId>>;

  // -- Events (solo lectura - escritura exclusiva via RPCs) --

  listEvents(
    jobId: CampaignPublicationJobId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignPublicationEvent>>;

  /**
   * RPC `append_publication_event` - service_role unicamente. Evento de
   * diagnostico adicional fuera de los ya emitidos automaticamente por
   * las transiciones anteriores (uso previsto: 8B.2/8B.3).
   */
  appendEvent(
    jobId: CampaignPublicationJobId,
    organizationId: OrganizationId,
    eventType: string,
    options?: {
      readonly attemptId?: CampaignPublicationAttemptId | null;
      readonly note?: string | null;
      readonly metadata?: Record<string, unknown>;
    },
  ): Promise<Result<CampaignPublicationEventId>>;

  // -- Webhook receipt foundation (S12, ruta HTTP diferida a 8B.3) --

  /**
   * RPC `record_publication_webhook_receipt` - service_role unicamente.
   * INSERT idempotente via `UNIQUE (provider, external_event_id)` -
   * `isNew: false` en el resultado significa replay detectado.
   */
  recordWebhookReceipt(
    input: RecordWebhookReceiptInput,
  ): Promise<Result<RecordWebhookReceiptResult>>;

  /** RPC `mark_webhook_event_processed` - service_role unicamente. */
  markWebhookEventProcessed(
    id: CampaignPublicationWebhookEvent['id'],
    status: PublicationWebhookEventStatus,
    options?: {
      readonly errorCode?: string | null;
      readonly jobId?: CampaignPublicationJobId | null;
      readonly organizationId?: OrganizationId | null;
      readonly attemptId?: CampaignPublicationAttemptId | null;
    },
  ): Promise<Result<void>>;
}
