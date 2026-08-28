/**
 * ListDispatchablePublicationJobs Use Case — Phase 8B.3.
 *
 * Consulta multi-tenant global para workers (service_role únicamente).
 * Retorna jobs en estado `queued` a través de todas las organizaciones en orden
 * determinístico (`created_at ASC, id ASC`), limitado por `batchSize`.
 *
 * REGLAS:
 * - Valida `batchSize`: min 1, max 50 (default 10).
 * - Uso exclusivo de workers/cron server-side.
 */

import type { Result } from '@bop-agency/shared';
import type { CampaignPublicationJob, CampaignPublicationRepository } from '@bop-agency/domain';

export type ListDispatchablePublicationJobsInput = {
  readonly batchSize?: number;
};

export type ListDispatchablePublicationJobsDeps = {
  readonly publicationRepository: CampaignPublicationRepository;
};

export const MAX_DISPATCHABLE_BATCH_SIZE = 50;
export const DEFAULT_DISPATCHABLE_BATCH_SIZE = 10;

export async function listDispatchablePublicationJobs(
  input: ListDispatchablePublicationJobsInput,
  deps: ListDispatchablePublicationJobsDeps,
): Promise<Result<CampaignPublicationJob[]>> {
  const rawBatchSize = input.batchSize ?? DEFAULT_DISPATCHABLE_BATCH_SIZE;
  const boundedBatchSize = Math.min(
    Math.max(1, Math.floor(rawBatchSize)),
    MAX_DISPATCHABLE_BATCH_SIZE,
  );

  return deps.publicationRepository.listDispatchableJobs(boundedBatchSize);
}
