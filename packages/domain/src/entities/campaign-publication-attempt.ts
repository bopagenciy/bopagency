/**
 * CampaignPublicationAttempt - entidad de dominio para la tabla
 * `public.campaign_publication_attempts` (Phase 8B.1).
 *
 * Un hecho historico INMUTABLE de una llamada concreta al proveedor -
 * "que paso exactamente en el intento numero N" (audit S3.1). Un job
 * puede tener 1..N attempts; nunca se sobrescribe un attempt existente en
 * retry (mismo criterio que `AutomationExecution` - retry crea fila
 * nueva). `outcome` espeja `PublishReceipt.outcome` ('confirmed' | 'unknown')
 * - 'unknown' es el caso central que motiva `unknown_outcome` a nivel job.
 */

import type { OrganizationId } from './organization';
import type { CampaignPublicationJobId } from './campaign-publication-job';
import type { PublicationAttemptOutcome } from '@bop-agency/shared';

// --- Branded ID ---

export type CampaignPublicationAttemptId = string & { readonly _brand: 'CampaignPublicationAttemptId' };

export function campaignPublicationAttemptId(id: string): CampaignPublicationAttemptId {
  if (!id || id.trim().length === 0) {
    throw new Error('CampaignPublicationAttemptId cannot be empty');
  }
  return id as CampaignPublicationAttemptId;
}

// --- CampaignPublicationAttempt entity ---

export type CampaignPublicationAttempt = {
  readonly id: CampaignPublicationAttemptId;
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  /** 1-based, unico dentro del job. */
  readonly attemptNumber: number;
  /** Idempotency key propagada al adapter/proveedor cuando soporta idempotencia nativa (S5.2). */
  readonly idempotencyKey: string;
  /** NULL hasta que el proveedor lo retorna (sync en publish() o async via reconciliacion/webhook). */
  readonly externalId: string | null;
  readonly externalUrl: string | null;
  /** Crudo del proveedor - nunca interpretado por dominio, solo diagnostico. */
  readonly providerStatus: string | null;
  /** SANITIZADO antes de persistir - nunca el error object crudo (puede contener tokens). */
  readonly providerErrorCode: string | null;
  readonly httpStatus: number | null;
  /** NULL mientras el attempt esta en curso (sin completedAt todavia). */
  readonly outcome: PublicationAttemptOutcome | null;
  readonly durationMs: number | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
};

export function isValidAttemptNumber(attemptNumber: number): boolean {
  return Number.isInteger(attemptNumber) && attemptNumber >= 1;
}

/** Un attempt esta "abierto" (en curso) mientras no tiene completedAt/outcome. */
export function isPublicationAttemptOpen(
  attempt: Pick<CampaignPublicationAttempt, 'completedAt' | 'outcome'>,
): boolean {
  return attempt.completedAt === null && attempt.outcome === null;
}

/**
 * Calcula duration_ms a partir de startedAt/completedAt - funcion pura
 * reutilizada tanto por dominio (validacion) como por las RPCs (SQL
 * equivalente `extract(epoch from ...) * 1000`).
 */
export function computeAttemptDurationMs(startedAt: Date, completedAt: Date): number {
  const ms = completedAt.getTime() - startedAt.getTime();
  if (ms < 0) {
    throw new Error('computeAttemptDurationMs: completedAt cannot be before startedAt');
  }
  return ms;
}
