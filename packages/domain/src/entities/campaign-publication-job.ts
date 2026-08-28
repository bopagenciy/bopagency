/**
 * CampaignPublicationJob - entidad de dominio para la tabla
 * `public.campaign_publication_jobs` (Phase 8B.1).
 *
 * Modela "una intencion de ejecutar publish para un
 * CampaignActivationTarget automatizado (provider <> 'manual')" - ver
 * docs/implementation/phase-8/PHASE_8B_PUBLISHING_GATEWAY_AUDIT.md S3/S4.
 * Deliberadamente SEPARADO de CampaignActivation/CampaignActivationTarget/
 * AutomationExecution (no colapsado en ningun otro aggregate).
 *
 * Un target tiene como maximo UN job no-terminal a la vez (constraint DB,
 * ver migracion). `unknown_outcome` NO es terminal - requiere
 * reconciliacion explicita (S4.2/S11.2). Retry = job NUEVO encadenado via
 * `retryOfJobId`, nunca reapertura de uno terminal (S4.3) - mismo patron
 * que `AutomationExecution.retryAutomationExecution` (Phase 6).
 *
 * Este modulo NO tiene I/O - solo tipos + funciones puras de transicion/
 * idempotencia. Persistencia real vive en infrastructure via las RPCs
 * `SECURITY DEFINER` de la migracion.
 */

import type { OrganizationId } from './organization';
import type { ClientId } from './client';
import type { CampaignActivationId } from './campaign-activation';
import type { CampaignActivationTargetId } from './campaign-activation-target';
import type { ActivationChannel, ActivationProvider } from '@bop-agency/shared';
import type {
  PublicationJobStatus,
  PublicationFailureCategory,
} from '@bop-agency/shared';
import {
  PUBLICATION_JOB_TERMINAL_STATUSES,
  PUBLICATION_IDEMPOTENCY_KEY_PREFIX,
  isRetryablePublicationFailure,
} from '@bop-agency/shared';

// --- Branded IDs ---

export type CampaignPublicationJobId = string & { readonly _brand: 'CampaignPublicationJobId' };

export function campaignPublicationJobId(id: string): CampaignPublicationJobId {
  if (!id || id.trim().length === 0) {
    throw new Error('CampaignPublicationJobId cannot be empty');
  }
  return id as CampaignPublicationJobId;
}

/**
 * PublicationIdempotencyKey - branded, formato fijo `publish:{org}:{target}:
 * {retryCount}` (audit S5.2). Construido EXCLUSIVAMENTE por
 * `buildPublicationIdempotencyKey` - nunca generado libremente por un
 * caller ni con aleatoriedad.
 */
export type PublicationIdempotencyKey = string & { readonly _brand: 'PublicationIdempotencyKey' };

export function buildPublicationIdempotencyKey(
  organizationId: OrganizationId,
  targetId: CampaignActivationTargetId,
  retryCount: number,
): PublicationIdempotencyKey {
  if (!Number.isInteger(retryCount) || retryCount < 0) {
    throw new Error('buildPublicationIdempotencyKey: retryCount must be a non-negative integer');
  }
  return `${PUBLICATION_IDEMPOTENCY_KEY_PREFIX}:${organizationId}:${targetId}:${retryCount}` as PublicationIdempotencyKey;
}

// --- CampaignPublicationJob entity ---

export type CampaignPublicationJob = {
  readonly id: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly activationId: CampaignActivationId;
  readonly targetId: CampaignActivationTargetId;
  /** Canal/proveedor - copia del target padre, verificada por trigger. Nunca 'manual'. */
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  /** Referencia de la client_integration usada - copia del target, verificada por trigger. */
  readonly clientIntegrationId: string | null;
  readonly status: PublicationJobStatus;
  readonly idempotencyKey: PublicationIdempotencyKey;
  readonly retryOfJobId: CampaignPublicationJobId | null;
  readonly retryCount: number;
  readonly claimedAt: Date | null;
  /** Identifica el proceso/worker que reclamo el job - nunca un userId. */
  readonly claimedByWorker: string | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  /** Deadline computado al entrar en in_progress - politica de reconciliacion (S13.3). */
  readonly reconciliationDeadlineAt: Date | null;
  readonly cancellationRequestedAt: Date | null;
  readonly cancellationRequestedBy: string | null;
  readonly failureCategory: PublicationFailureCategory | null;
  readonly reconciledBy: string | null;
  readonly reconciledAt: Date | null;
  readonly reconciliationNote: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// --- Input types ---

export type CreatePublicationJobInput = {
  readonly targetId: CampaignActivationTargetId;
  readonly organizationId: OrganizationId;
  /** Cuando se provee, este job es un retry del job referenciado (S4.3). */
  readonly retryOfJobId?: CampaignPublicationJobId | null;
};

// --- Transition rules - audit S4.1/S4.2 ---
//
//   queued     -> claimed, cancelled
//   claimed    -> in_progress, cancelled
//   in_progress-> succeeded, failed, unknown_outcome
//   unknown_outcome -> succeeded, failed   (SOLO via reconcile_publication_job)
//   succeeded / failed / cancelled -> (terminal)
//
// Cancelar un job in_progress NO es una transicion de estado (S4.4) - es
// una intencion cooperativa (`cancellationRequestedAt`) que el propio
// dominio no modela como edge del grafo; ver `canRequestCooperativeCancel`.

const PUBLICATION_JOB_TRANSITIONS: Record<PublicationJobStatus, PublicationJobStatus[]> = {
  queued: ['claimed', 'cancelled'],
  claimed: ['in_progress', 'cancelled'],
  in_progress: ['succeeded', 'failed', 'unknown_outcome'],
  unknown_outcome: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionPublicationJob(
  from: PublicationJobStatus,
  to: PublicationJobStatus,
): boolean {
  return PUBLICATION_JOB_TRANSITIONS[from].includes(to);
}

export function getPublicationJobNextStates(status: PublicationJobStatus): PublicationJobStatus[] {
  return [...PUBLICATION_JOB_TRANSITIONS[status]];
}

/**
 * Transiciona `from` a `to`, o lanza si la transicion es ilegal. Funcion
 * pura de dominio - no persiste nada, solo valida el grafo de estados
 * (mismo criterio que `canTransitionActivationTarget`, expresado tambien
 * como transicion-que-lanza para los callers que prefieran ese estilo).
 */
export function transitionPublicationJob(
  from: PublicationJobStatus,
  to: PublicationJobStatus,
): PublicationJobStatus {
  if (!canTransitionPublicationJob(from, to)) {
    throw new Error(`transitionPublicationJob: illegal transition ${from} -> ${to}`);
  }
  return to;
}

export function isPublicationJobTerminal(status: PublicationJobStatus): boolean {
  return (PUBLICATION_JOB_TERMINAL_STATUSES as readonly PublicationJobStatus[]).includes(status);
}

/**
 * Cancelacion directa (queued/claimed, antes de cualquier llamada al
 * proveedor) - rol operator+ (locked decision #2 / audit S10).
 */
export function canDirectlyCancelPublicationJob(status: PublicationJobStatus): boolean {
  return status === 'queued' || status === 'claimed';
}

/**
 * Cancelacion cooperativa (in_progress) - NUNCA una transicion de estado
 * directa (S4.4). Rol strategist+ (locked decision #2 / audit S10). El job
 * permanece in_progress hasta que resuelva a succeeded/failed/
 * unknown_outcome; la solicitud solo evita que se cree un retry automatico.
 */
export function canRequestCooperativeCancel(status: PublicationJobStatus): boolean {
  return status === 'in_progress';
}

/**
 * `unknown_outcome` NUNCA se reintenta ciegamente (CRITICO, S4.2/S11).
 * Retry solo es elegible desde `failed` con categoria retryable - nunca
 * directamente desde `unknown_outcome` (debe reconciliarse primero, lo
 * cual - si resulta "no publico" - lo deja en `failed` con
 * `UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED`, que SI es retryable).
 *
 * Run 4 (2026-08-27) — MISMA condicion exacta gobierna ahora dos RPCs
 * distintas, que deben permanecer sincronizadas: (1)
 * `create_publication_job(retry_of_job_id=...)`, que la exige del job
 * referenciado antes de encadenar el retry; (2) la NUEVA
 * `prepare_publication_retry(job_id, note)` (rol strategist+,
 * `20260828100000_phase8b1_publication_retry_reset.sql`), que la exige
 * del mismo job ANTES de autorizar el reset `failed -> ready` del target
 * que hace alcanzable el paso (1) para un job que realmente fallo (ver
 * R-PUB-13). El espejo SQL de esta funcion es
 * `public.is_publication_failure_retryable(text)` en esa misma migracion —
 * ambas RPCs SQL llaman a ese unico helper, nunca repiten la lista
 * inline, para que nunca puedan divergir de esta funcion de dominio.
 */
export function canRetryPublicationJob(
  job: Pick<CampaignPublicationJob, 'status' | 'failureCategory'>,
): boolean {
  if (job.status !== 'failed') return false;
  if (!job.failureCategory) return false;
  return isRetryablePublicationFailure(job.failureCategory);
}

/**
 * Reconciliacion manual/automatica solo aplica a jobs en `unknown_outcome`
 * (S11.2). Nunca a ningun otro estado - ni siquiera `failed`.
 */
export function canReconcilePublicationJob(status: PublicationJobStatus): boolean {
  return status === 'unknown_outcome';
}

/**
 * Computa el deadline de reconciliacion a partir de `startedAt` y un
 * timeout en minutos (default configurable - NO un invariante hardcodeado,
 * ver `DEFAULT_PUBLICATION_RECONCILIATION_TIMEOUT_MINUTES` en
 * `@bop-agency/shared`). El caller (RPC `start_publication_job`) decide
 * el valor real a persistir; esta funcion es pura y no lee ninguna
 * variable global.
 */
export function computeReconciliationDeadline(startedAt: Date, timeoutMinutes: number): Date {
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    throw new Error('computeReconciliationDeadline: timeoutMinutes must be a positive number');
  }
  return new Date(startedAt.getTime() + timeoutMinutes * 60_000);
}
