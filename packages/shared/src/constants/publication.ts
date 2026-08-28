/**
 * Campaign Publication — enums cerrados (Phase 8B.1).
 *
 * Fuente unica de verdad para los valores permitidos de status/outcome/
 * evento/categoria de fallo de `CampaignPublicationJob` /
 * `CampaignPublicationAttempt` / `CampaignPublicationEvent` /
 * `CampaignPublicationWebhookEvent`. Alineados 1:1 con los ENUMs/CHECKs de
 * Postgres creados en
 * 20260825120000_phase8b1_publication_domain_persistence.sql y con
 * docs/implementation/phase-8/PHASE_8B_PUBLISHING_GATEWAY_AUDIT.md S3/S4/
 * S11/S15.
 *
 * Reutiliza `ActivationProvider`/`ActivationChannel` de ./activation —
 * 8B.1 NO introduce un enum de proveedor nuevo (audit S1.1 confirmado).
 *
 * NO ampliar estas listas sin actualizar la migracion (ENUM/CHECK de DB) y
 * este archivo a la vez.
 */

// --- Publication job status - audit S4.1 ---

export const PUBLICATION_JOB_STATUSES = [
  'queued',
  'claimed',
  'in_progress',
  'succeeded',
  'failed',
  'cancelled',
  'unknown_outcome',
] as const;

export type PublicationJobStatus = (typeof PUBLICATION_JOB_STATUSES)[number];

/**
 * Estados terminales - sin transiciones salientes.
 *
 * `unknown_outcome` NO es terminal (audit S4.2) - requiere reconciliacion
 * explicita antes de poder cerrarse.
 */
export const PUBLICATION_JOB_TERMINAL_STATUSES: readonly PublicationJobStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
];

// --- Publication attempt outcome - espeja PublishReceipt.outcome (audit S15.1) ---

export const PUBLICATION_ATTEMPT_OUTCOMES = ['confirmed', 'unknown'] as const;

export type PublicationAttemptOutcome = (typeof PUBLICATION_ATTEMPT_OUTCOMES)[number];

// --- Failure taxonomy - audit S11.1, extiende (no reemplaza) la de 8A ---

export const PUBLICATION_FAILURE_CATEGORIES = [
  'ACTIVATION_NOT_READY',
  'CHANNEL_NOT_CONFIGURED',
  'INTEGRATION_NOT_AVAILABLE',
  'AUTH_EXPIRED',
  'RATE_LIMITED',
  'PROVIDER_REJECTED',
  'PUBLISHING_TIMEOUT',
  'INVALID_ASSET',
  'BUDGET_INVALID',
  'DISPATCH_FAILED',
  'UNKNOWN_OUTCOME',
  'PROVIDER_OUTAGE',
  /** Poblado unicamente por reconcile_publication_job cuando el resultado
   *  reconciliado es "no publico" - audit S11.2 paso 4. Habilita retry. */
  'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED',
] as const;

export type PublicationFailureCategory = (typeof PUBLICATION_FAILURE_CATEGORIES)[number];

/**
 * Categorias elegibles para retry automatico/asistido (audit S4.3 punto 1,
 * S11.1 columna "Retryable"). `UNKNOWN_OUTCOME` en si NUNCA es retryable -
 * solo lo es una vez reconciliado a `UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED`.
 */
export const PUBLICATION_RETRYABLE_FAILURE_CATEGORIES: readonly PublicationFailureCategory[] = [
  'INTEGRATION_NOT_AVAILABLE',
  'RATE_LIMITED',
  'DISPATCH_FAILED',
  'PROVIDER_OUTAGE',
  'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED',
];

export function isRetryablePublicationFailure(category: string): boolean {
  return (PUBLICATION_RETRYABLE_FAILURE_CATEGORIES as readonly string[]).includes(category);
}

// --- Publication event type - append-only log (audit S15.1) ---

export const PUBLICATION_EVENT_TYPES = [
  'job_queued',
  'job_claimed',
  'job_started',
  'job_succeeded',
  'job_failed',
  'job_cancelled',
  'job_marked_unknown_outcome',
  'job_reconciled',
  'webhook_received',
  /** Emitido por prepare_publication_retry (20260828100000) sobre el job
   *  FALLIDO ORIGINAL (nunca se muta su status) al autorizar explicitamente
   *  el reset failed->ready de su target para permitir un retry. */
  'retry_prepared',
] as const;

export type PublicationEventType = (typeof PUBLICATION_EVENT_TYPES)[number];

// --- Webhook receipt status - generaliza automation_webhook_events (audit S14) ---

export const PUBLICATION_WEBHOOK_EVENT_STATUSES = ['received', 'processed', 'failed'] as const;

export type PublicationWebhookEventStatus = (typeof PUBLICATION_WEBHOOK_EVENT_STATUSES)[number];

// --- Reconciliation policy - audit S11.2/S13.3, kickoff decision #3 ---
//
// Default configurable, NUNCA un invariante permanente - vive aqui como
// constante nombrada (no un numero magico disperso). La DB persiste el
// deadline COMPUTADO por job (`reconciliation_deadline_at`), nunca este
// valor en si; un proveedor futuro puede pasar un override explicito al
// RPC `start_publication_job` (`p_reconciliation_timeout_minutes`) sin
// tocar este archivo. Cambiar este default no re-escribe deadlines ya
// persistidos.

export const DEFAULT_PUBLICATION_RECONCILIATION_TIMEOUT_MINUTES = 15;

// --- Idempotency key format - audit S5.2 ---
//
// Deterministico, sin aleatoriedad: `publish:{organizationId}:{targetId}:
// {retryCount}`. retryCount se lee del ultimo job real del target en DB
// (nunca un contador client-side). Ver
// packages/domain/src/entities/campaign-publication-job.ts
// `buildPublicationIdempotencyKey`.

export const PUBLICATION_IDEMPOTENCY_KEY_PREFIX = 'publish';
