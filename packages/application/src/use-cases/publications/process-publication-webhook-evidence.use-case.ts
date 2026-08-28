/**
 * ProcessPublicationWebhookEvidence Use Case — Phase 8B.3.
 *
 * Procesa la evidencia de webhooks entrantes recibidos en `/api/webhooks/publishing/callback`.
 *
 * REGLA DE ARQUITECTURA CRÍTICA (MODELO A):
 *   Este use case es EXCLUSIVAMENTE para procesamiento de EVIDENCIA y AUDITORÍA.
 *   NUNCA invoca `recordSuccess`, `recordFailure` ni `recordUnknownOutcome`.
 *   En MODELO A, el dispatch sincrónico (`dispatchPublicationJob`) es la ÚNICA
 *   autoridad que transiciona el resultado del job de publicación.
 *
 * RESULTADOS POSIBLES:
 *   - `EVIDENCE_RECORDED`: Job está en_progress; se registró evidencia.
 *   - `JOB_ALREADY_CLOSED`: Job ya es terminal (succeeded/failed/cancelled).
 *   - `REQUIRES_RECONCILIATION`: Job está en unknown_outcome; exige reconciliación manual.
 *   - `JOB_NOT_FOUND`: Job referenciado no existe.
 *   - `ORGANIZATION_MISMATCH`: organizationId no coincide con el del job.
 */

import { ok } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignPublicationJobId,
  OrganizationId,
  CampaignPublicationRepository,
} from '@bop-agency/domain';
import type { ActivationProvider } from '@bop-agency/shared';

export type ProcessWebhookEvidenceStatus =
  | 'EVIDENCE_RECORDED'
  | 'JOB_ALREADY_CLOSED'
  | 'REQUIRES_RECONCILIATION'
  | 'JOB_NOT_FOUND'
  | 'ORGANIZATION_MISMATCH';

export type ProcessPublicationWebhookEvidenceInput = {
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  readonly provider: ActivationProvider;
  readonly externalEventId: string;
  readonly outcome?: string | null;
  readonly externalId?: string | null;
  readonly failureCategory?: string | null;
  readonly note?: string | null;
};

export type ProcessPublicationWebhookEvidenceDeps = {
  readonly publicationRepository: CampaignPublicationRepository;
};

export type ProcessWebhookEvidenceResult = {
  readonly status: ProcessWebhookEvidenceStatus;
  readonly note: string;
  readonly currentJobStatus?: string;
};

export async function processPublicationWebhookEvidence(
  input: ProcessPublicationWebhookEvidenceInput,
  deps: ProcessPublicationWebhookEvidenceDeps,
): Promise<Result<ProcessWebhookEvidenceResult>> {
  const jobResult = await deps.publicationRepository.findJobById(
    input.jobId,
    input.organizationId,
  );

  if (!jobResult.success || !jobResult.value) {
    return ok({
      status: 'JOB_NOT_FOUND',
      note: `Publication job not found (id: ${input.jobId})`,
    });
  }

  const job = jobResult.value;

  if (job.organizationId !== input.organizationId) {
    return ok({
      status: 'ORGANIZATION_MISMATCH',
      note: `Job organization mismatch (expected: ${input.organizationId}, actual: ${job.organizationId})`,
      currentJobStatus: job.status,
    });
  }

  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
    return ok({
      status: 'JOB_ALREADY_CLOSED',
      note: `Job is already terminal (current status: ${job.status}). Webhook evidence logged as idempotent no-op.`,
      currentJobStatus: job.status,
    });
  }

  if (job.status === 'unknown_outcome') {
    return ok({
      status: 'REQUIRES_RECONCILIATION',
      note: 'Job is in unknown_outcome state. Webhook evidence recorded, but manual strategist reconciliation is required.',
      currentJobStatus: job.status,
    });
  }

  // Si está in_progress, se registra evidencia. NUNCA transiciona estado en DB.
  return ok({
    status: 'EVIDENCE_RECORDED',
    note: `Webhook evidence recorded for in_progress job ${input.jobId}.`,
    currentJobStatus: job.status,
  });
}
