/**
 * executeMetricsSyncTarget — Caso de uso orquestador para la ejecución de un target vencido de sincronización de métricas (Phase 9B.3).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  OrganizationId,
  CampaignMetricsSyncStateId,
  CampaignMetricsSyncState,
  CampaignMetricsSyncStateRepository,
  MetricsSyncErrorCategory,
} from '@bop-agency/domain';
import {
  DEFAULT_SYNC_LOOKBACK_DAYS,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  CLAIM_LEASE_MINUTES,
  ERROR_BACKOFF_MINUTES,
  MAX_SYNC_ERROR_MESSAGE_LENGTH,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';
import type { MetricsProviderRegistry } from '../../ports/metrics-provider-registry';
import { syncCampaignMetrics } from './sync-campaign-metrics.use-case';

export type ExecuteMetricsSyncTargetInput = {
  readonly actorUserId: string;
  readonly organizationId: OrganizationId;
  readonly syncStateId: CampaignMetricsSyncStateId;
  readonly claimToken: string;
  readonly lookbackDays?: number;
  readonly intervalMinutes?: number;
};

export type ExecuteMetricsSyncTargetDeps = {
  readonly syncStateRepository: CampaignMetricsSyncStateRepository;
  readonly snapshotRepository: Parameters<typeof syncCampaignMetrics>[1]['snapshotRepository'];
  readonly providerRegistry: MetricsProviderRegistry;
  readonly isOrganizationMember: (organizationId: OrganizationId, userId: string) => Promise<boolean>;
  readonly logger: LoggerPort;
  readonly now?: () => Date;
};

export type ExecuteMetricsSyncTargetSummary = {
  readonly syncStateId: CampaignMetricsSyncStateId;
  readonly status: 'succeeded' | 'failed' | 'not_claimed';
  readonly recordsFetched: number;
  readonly recordsSaved: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly syncedThroughDate: string | null;
  readonly nextEligibleSyncAt: Date;
  readonly syncState: CampaignMetricsSyncState;
};

export type ExecuteMetricsSyncTargetError =
  | { readonly code: 'UNAUTHORIZED'; readonly message: string }
  | { readonly code: 'NOT_FOUND'; readonly message: string }
  | { readonly code: 'NOT_CLAIMED'; readonly message: string }
  | { readonly code: 'INTERNAL_ERROR'; readonly message: string };

function toIsoDateString(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function executeMetricsSyncTarget(
  input: ExecuteMetricsSyncTargetInput,
  deps: ExecuteMetricsSyncTargetDeps,
): Promise<Result<ExecuteMetricsSyncTargetSummary, ExecuteMetricsSyncTargetError>> {
  const getNow = deps.now || (() => new Date());

  // 1. Autorización
  if (!input.actorUserId || input.actorUserId.trim().length === 0) {
    return err({ code: 'UNAUTHORIZED', message: 'Actor user ID is required' });
  }

  let isMember = false;
  try {
    isMember = await deps.isOrganizationMember(input.organizationId, input.actorUserId);
  } catch (cause) {
    return err({
      code: 'INTERNAL_ERROR',
      message: `Authorization check failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    });
  }

  if (!isMember) {
    return err({
      code: 'UNAUTHORIZED',
      message: `User ${input.actorUserId} is not authorized for organization ${input.organizationId}`,
    });
  }

  // 2. Reclamo atómico (Locking)
  const claimRes = await deps.syncStateRepository.claimDueTarget(
    input.syncStateId,
    input.claimToken,
    CLAIM_LEASE_MINUTES,
  );

  if (!claimRes.success) {
    return err({
      code: 'INTERNAL_ERROR',
      message: `Failed to claim sync state target: ${claimRes.error.message}`,
    });
  }

  if (!claimRes.value.claimed || !claimRes.value.syncState) {
    const existing = await deps.syncStateRepository.findById(input.syncStateId);
    if (!existing.success) {
      return err({ code: 'NOT_FOUND', message: `Sync state target ${input.syncStateId} not found` });
    }
    return err({
      code: 'NOT_CLAIMED',
      message: `Sync state target ${input.syncStateId} is already claimed or not due`,
    });
  }

  const syncState = claimRes.value.syncState;
  const attemptedAt = getNow();

  // 3. Calcular ventana de fechas (Rolling Lookback Days ending today)
  const lookback = input.lookbackDays || DEFAULT_SYNC_LOOKBACK_DAYS;
  const endDateStr = toIsoDateString(attemptedAt);

  const startDateObj = new Date(attemptedAt.getTime() - (lookback - 1) * 24 * 60 * 60 * 1000);
  const startDateStr = toIsoDateString(startDateObj);

  // 4. Ejecutar la sincronización mediante el caso de uso canónico de Ingestión
  const ingestionRes = await syncCampaignMetrics(
    {
      actorUserId: input.actorUserId,
      organizationId: syncState.organizationId,
      clientId: syncState.clientId,
      campaignId: syncState.campaignId,
      activationId: syncState.activationId,
      platform: syncState.platform,
      providerAccountId: syncState.providerAccountId,
      startDate: startDateStr,
      endDate: endDateStr,
      scope: syncState.scope,
      granularity: syncState.granularity,
    },
    {
      snapshotRepository: deps.snapshotRepository,
      providerRegistry: deps.providerRegistry,
      isOrganizationMember: deps.isOrganizationMember,
      logger: deps.logger,
    },
  );

  const intervalMin = input.intervalMinutes || DEFAULT_SYNC_INTERVAL_MINUTES;

  // 5. Manejo de éxito
  if (ingestionRes.success) {
    const summary = ingestionRes.value;
    const nextEligibleAt = new Date(attemptedAt.getTime() + intervalMin * 60 * 1000);

    const markSuccessRes = await deps.syncStateRepository.markSuccess({
      syncStateId: syncState.id,
      claimToken: input.claimToken,
      attemptedAt,
      syncedThroughDate: endDateStr,
      nextEligibleSyncAt: nextEligibleAt,
    });

    const updatedState = markSuccessRes.success ? markSuccessRes.value : syncState;

    return ok({
      syncStateId: syncState.id,
      status: 'succeeded',
      recordsFetched: summary.recordsFetched,
      recordsSaved: summary.recordsSaved,
      startDate: startDateStr,
      endDate: endDateStr,
      syncedThroughDate: endDateStr,
      nextEligibleSyncAt: nextEligibleAt,
      syncState: updatedState,
    });
  }

  // 6. Manejo de fallo y cálculo de backoff
  const syncError = ingestionRes.error;
  let category: MetricsSyncErrorCategory = 'UNKNOWN';
  let message = syncError.message;

  if (syncError.code === 'PROVIDER_ERROR' && syncError.providerError) {
    category = syncError.providerError.category;
    message = syncError.providerError.message;
  } else if (syncError.code === 'UNAUTHORIZED') {
    category = 'AUTH_FAILURE';
  } else if (syncError.code === 'INVALID_ARGUMENT') {
    category = 'INVALID_REQUEST';
  }

  const sanitizedMessage = message
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer REDACTED')
    .replace(/developer-token=[^\s]+/gi, 'developer-token=REDACTED')
    .slice(0, MAX_SYNC_ERROR_MESSAGE_LENGTH);

  const backoffMin = ERROR_BACKOFF_MINUTES[category] || 240;
  const nextEligibleFailureAt = new Date(attemptedAt.getTime() + backoffMin * 60 * 1000);

  const markFailureRes = await deps.syncStateRepository.markFailure({
    syncStateId: syncState.id,
    claimToken: input.claimToken,
    attemptedAt,
    errorCategory: category,
    errorMessage: sanitizedMessage,
    nextEligibleSyncAt: nextEligibleFailureAt,
  });

  const updatedStateOnFail = markFailureRes.success ? markFailureRes.value : syncState;

  return ok({
    syncStateId: syncState.id,
    status: 'failed',
    recordsFetched: 0,
    recordsSaved: 0,
    startDate: startDateStr,
    endDate: endDateStr,
    syncedThroughDate: syncState.lastSyncedThroughDate,
    nextEligibleSyncAt: nextEligibleFailureAt,
    syncState: updatedStateOnFail,
  });
}
