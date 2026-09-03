/**
 * executeMetricsSyncBatch — Caso de uso orquestador runtime para la ejecución acotada en lote
 * de sincronización de métricas multi-tenant (Phase 9B.4).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, MetricPlatform } from '@bop-agency/shared';
import type {
  CampaignMetricsSyncStateRepository,
  CampaignMetricSnapshotRepository,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';
import type { MetricsProviderRegistry } from '../../ports/metrics-provider-registry';
import {
  executeMetricsSyncTarget,
  type ExecutionPrincipal,
  type ExecuteMetricsSyncTargetSummary,
} from './execute-metrics-sync-target.use-case';

export const DEFAULT_RUNTIME_SYNC_BATCH_SIZE = 25;
export const DEFAULT_RUNTIME_CONCURRENCY = 1;
export const DEFAULT_RUNTIME_DEADLINE_MS = 20000; // 20s
export const MIN_TARGET_START_BUDGET_MS = 5000; // 5s

export type ExecuteMetricsSyncBatchInput = {
  readonly principal?: ExecutionPrincipal;
  readonly batchSize?: number;
  readonly maxConcurrency?: number;
  readonly deadlineMs?: number;
  readonly platform?: MetricPlatform | null;
};

export type ExecuteMetricsSyncBatchDeps = {
  readonly syncStateRepository: CampaignMetricsSyncStateRepository;
  readonly snapshotRepository: CampaignMetricSnapshotRepository;
  readonly providerRegistry: MetricsProviderRegistry;
  readonly activationRepository?: Parameters<typeof executeMetricsSyncTarget>[1]['activationRepository'] | undefined;
  readonly logger: LoggerPort;
  readonly now?: () => Date;
};

export type ExecuteMetricsSyncBatchSummary = {
  readonly invocationId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly discovered: number;
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
  readonly deferred: number;
  readonly recordsFetched: number;
  readonly recordsSaved: number;
  readonly targetSummaries: readonly ExecuteMetricsSyncTargetSummary[];
};

export type ExecuteMetricsSyncBatchError =
  | { readonly code: 'UNAUTHORIZED'; readonly message: string }
  | { readonly code: 'INTERNAL_ERROR'; readonly message: string };

export async function executeMetricsSyncBatch(
  input: ExecuteMetricsSyncBatchInput,
  deps: ExecuteMetricsSyncBatchDeps,
): Promise<Result<ExecuteMetricsSyncBatchSummary, ExecuteMetricsSyncBatchError>> {
  const getNow = deps.now || (() => new Date());
  const startTime = Date.now();
  const startedAtDate = getNow();
  const invocationId = crypto.randomUUID();

  const principal: ExecutionPrincipal = input.principal || {
    type: 'system',
    systemId: 'metrics_scheduler',
  };

  if (principal.type !== 'system' || principal.systemId !== 'metrics_scheduler') {
    return err({
      code: 'UNAUTHORIZED',
      message: 'Batch execution requires system metrics_scheduler principal',
    });
  }

  const batchSize = Math.min(Math.max(1, input.batchSize || DEFAULT_RUNTIME_SYNC_BATCH_SIZE), 50);
  const deadlineMs = input.deadlineMs || DEFAULT_RUNTIME_DEADLINE_MS;

  // 1. Descubrimiento acotado de targets vencidos multi-tenant
  const listRes = await deps.syncStateRepository.listDueTargetsGlobal(input.platform, batchSize);

  if (!listRes.success) {
    deps.logger.error('[executeMetricsSyncBatch] Failed to list due sync targets globally', {
      error: listRes.error,
    });
    return err({
      code: 'INTERNAL_ERROR',
      message: `Failed to list due sync targets globally: ${listRes.error.message}`,
    });
  }

  const candidateStates = listRes.value;
  const discovered = candidateStates.length;

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;
  let recordsFetched = 0;
  let recordsSaved = 0;
  const targetSummaries: ExecuteMetricsSyncTargetSummary[] = [];

  // 2. Procesamiento acotado respetando presupuesto de tiempo mínimo por target
  for (let i = 0; i < candidateStates.length; i++) {
    const candidate = candidateStates[i];
    if (!candidate) continue;

    const elapsed = Date.now() - startTime;
    const remainingTime = deadlineMs - elapsed;

    if (remainingTime < MIN_TARGET_START_BUDGET_MS) {
      deferred += candidateStates.length - i;
      deps.logger.warn(
        `[executeMetricsSyncBatch] Remaining budget insufficient (${remainingTime}ms < ${MIN_TARGET_START_BUDGET_MS}ms). Deferring ${candidateStates.length - i} targets.`,
      );
      break;
    }

    const claimToken = crypto.randomUUID();

    const execRes = await executeMetricsSyncTarget(
      {
        principal,
        organizationId: candidate.organizationId,
        syncStateId: candidate.id,
        claimToken,
      },
      {
        syncStateRepository: deps.syncStateRepository,
        snapshotRepository: deps.snapshotRepository,
        providerRegistry: deps.providerRegistry,
        activationRepository: deps.activationRepository,
        logger: deps.logger,
        now: getNow,
      },
    );

    if (!execRes.success) {
      if (execRes.error.code === 'NOT_CLAIMED') {
        skipped++;
      } else {
        failed++;
        deps.logger.error(
          `[executeMetricsSyncBatch] Sync execution error for target ${candidate.targetId}`,
          { error: execRes.error },
        );
      }
      continue;
    }

    const summary = execRes.value;
    targetSummaries.push(summary);

    if (summary.status === 'succeeded') {
      claimed++;
      succeeded++;
      recordsFetched += summary.recordsFetched;
      recordsSaved += summary.recordsSaved;
    } else if (summary.status === 'failed') {
      claimed++;
      failed++;
    } else if (summary.status === 'not_claimed') {
      skipped++;
    }
  }

  const finishedAtDate = getNow();
  const durationMs = Date.now() - startTime;

  return ok({
    invocationId,
    startedAt: startedAtDate.toISOString(),
    finishedAt: finishedAtDate.toISOString(),
    durationMs,
    discovered,
    claimed,
    succeeded,
    failed,
    skipped,
    deferred,
    recordsFetched,
    recordsSaved,
    targetSummaries,
  });
}
