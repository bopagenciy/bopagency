/**
 * executeMetricsSyncTarget — Caso de uso orquestador para la ejecución de un target vencido de sincronización de métricas (Phase 9B.3 & 9B.4).
 *
 * Soporta dos tipos de principal de ejecución explícitos (ExecutionPrincipal):
 *   1. User principal: Requiere verificación de membresía de organización mediante `isOrganizationMember`.
 *   2. System principal (systemId = 'metrics_scheduler'): Ejecución del worker de fondo del sistema. Omite el lookup
 *      de membresía humana pero valida la consistencia multitenant del recurso antes de la llamada al proveedor.
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

export type ExecutionPrincipal =
  | { readonly type: 'user'; readonly userId: string }
  | { readonly type: 'system'; readonly systemId: 'metrics_scheduler' };

export type ExecuteMetricsSyncTargetInput = {
  readonly principal?: ExecutionPrincipal;
  readonly actorUserId?: string;
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
  readonly isOrganizationMember?: (organizationId: OrganizationId, userId: string) => Promise<boolean>;
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

  const principal: ExecutionPrincipal = input.principal || {
    type: 'user',
    userId: input.actorUserId || '',
  };

  // 1. Autorización según tipo de Principal
  if (principal.type === 'user') {
    if (!principal.userId || principal.userId.trim().length === 0) {
      return err({ code: 'UNAUTHORIZED', message: 'Actor user ID is required for user principal' });
    }

    if (!deps.isOrganizationMember) {
      return err({ code: 'UNAUTHORIZED', message: 'isOrganizationMember dependency required for user principal' });
    }

    let isMember = false;
    try {
      isMember = await deps.isOrganizationMember(input.organizationId, principal.userId);
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Authorization check failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }

    if (!isMember) {
      return err({
        code: 'UNAUTHORIZED',
        message: `User ${principal.userId} is not authorized for organization ${input.organizationId}`,
      });
    }
  } else if (principal.type === 'system') {
    if (principal.systemId !== 'metrics_scheduler') {
      return err({ code: 'UNAUTHORIZED', message: `Invalid system principal ID: ${principal.systemId}` });
    }
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
    deps.logger.info(`Target sync state ${input.syncStateId} was not claimed (already locked or fresh)`);
    return err({
      code: 'NOT_CLAIMED',
      message: `Target ${input.syncStateId} was not claimed by token ${input.claimToken}`,
    });
  }

  const syncState = claimRes.value.syncState;
  const now = getNow();

  // Validar correspondencia de organización en el estado reclamado
  if (syncState.organizationId !== input.organizationId) {
    return err({
      code: 'UNAUTHORIZED',
      message: `Sync state ${syncState.id} organization mismatch: expected ${input.organizationId}, got ${syncState.organizationId}`,
    });
  }

  const lookback = input.lookbackDays || DEFAULT_SYNC_LOOKBACK_DAYS;
  const intervalMins = input.intervalMinutes || DEFAULT_SYNC_INTERVAL_MINUTES;

  const endDateObj = now;
  const startDateObj = new Date(now.getTime() - lookback * 24 * 60 * 60 * 1000);

  const startDate = toIsoDateString(startDateObj);
  const endDate = toIsoDateString(endDateObj);

  // 3. Ejecución de la sincronización de métricas
  const actorId = principal.type === 'user' ? principal.userId : `system:metrics-scheduler:${input.claimToken}`;

  const syncRes = await syncCampaignMetrics(
    {
      actorUserId: actorId,
      organizationId: syncState.organizationId,
      clientId: syncState.clientId,
      campaignId: syncState.campaignId,
      platform: syncState.platform,
      providerAccountId: syncState.providerAccountId,
      startDate,
      endDate,
    },
    {
      snapshotRepository: deps.snapshotRepository,
      providerRegistry: deps.providerRegistry,
      isOrganizationMember: async () => true, // Validado arriba por el principal
      logger: deps.logger,
    },
  );

  if (!syncRes.success) {
    const errorCategory: MetricsSyncErrorCategory =
      syncRes.error.code === 'PROVIDER_ERROR'
        ? syncRes.error.providerError.category
        : syncRes.error.code === 'UNAUTHORIZED'
        ? 'AUTH_FAILURE'
        : 'UNKNOWN';

    const rawMessage = syncRes.error.message;
    const sanitizedMessage = rawMessage.substring(0, MAX_SYNC_ERROR_MESSAGE_LENGTH);

    const backoffMins = ERROR_BACKOFF_MINUTES[errorCategory] || 60;
    const nextEligibleSyncAt = new Date(now.getTime() + backoffMins * 60 * 1000);

    const markFailRes = await deps.syncStateRepository.markFailure({
      syncStateId: syncState.id,
      claimToken: input.claimToken,
      attemptedAt: now,
      errorCategory,
      errorMessage: sanitizedMessage,
      nextEligibleSyncAt,
    });


    const updatedState = markFailRes.success ? markFailRes.value : syncState;

    deps.logger.warn(`Sync failed for target ${syncState.targetId}`, {
      syncStateId: syncState.id,
      error: syncRes.error,
    });

    return ok({
      syncStateId: syncState.id,
      status: 'failed',
      recordsFetched: 0,
      recordsSaved: 0,
      startDate,
      endDate,
      syncedThroughDate: null,
      nextEligibleSyncAt,
      syncState: updatedState,
    });
  }

  // 4. Actualizar estado de frescura en caso de éxito
  const summaryData = syncRes.value;
  const nextEligibleSyncAt = new Date(now.getTime() + intervalMins * 60 * 1000);

  const markSuccessRes = await deps.syncStateRepository.markSuccess({
    syncStateId: syncState.id,
    claimToken: input.claimToken,
    attemptedAt: now,
    syncedThroughDate: endDate,
    nextEligibleSyncAt,
  });

  const updatedState = markSuccessRes.success ? markSuccessRes.value : syncState;

  deps.logger.info(`Sync succeeded for target ${syncState.targetId}`, {
    syncStateId: syncState.id,
    recordsFetched: summaryData.recordsFetched,
    recordsSaved: summaryData.recordsSaved,
  });

  return ok({
    syncStateId: syncState.id,
    status: 'succeeded',
    recordsFetched: summaryData.recordsFetched,
    recordsSaved: summaryData.recordsSaved,
    startDate,
    endDate,
    syncedThroughDate: endDate,
    nextEligibleSyncAt,
    syncState: updatedState,
  });
}
