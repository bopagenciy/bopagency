/**
 * listDueMetricsSyncTargets — Caso de uso para la consulta y descubrimiento de targets vencidos de sincronización de métricas (Phase 9B.3).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { MetricPlatform } from '@bop-agency/shared';
import type {
  OrganizationId,
  CampaignMetricsSyncState,
  CampaignMetricsSyncStateRepository,
  CampaignActivationRepository,
} from '@bop-agency/domain';
import { MAX_SYNC_BATCH_SIZE } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListDueMetricsSyncTargetsInput = {
  readonly actorUserId: string;
  readonly organizationId: OrganizationId;
  readonly platform?: MetricPlatform | null;
  readonly limit?: number;
};

export type ListDueMetricsSyncTargetsDeps = {
  readonly syncStateRepository: CampaignMetricsSyncStateRepository;
  readonly activationRepository: CampaignActivationRepository;
  readonly isOrganizationMember: (organizationId: OrganizationId, userId: string) => Promise<boolean>;
  readonly logger: LoggerPort;
  readonly now?: () => Date;
};

export type ListDueMetricsSyncTargetsError =
  | { readonly code: 'UNAUTHORIZED'; readonly message: string }
  | { readonly code: 'INVALID_ARGUMENT'; readonly message: string }
  | { readonly code: 'INTERNAL_ERROR'; readonly message: string };

export async function listDueMetricsSyncTargets(
  input: ListDueMetricsSyncTargetsInput,
  deps: ListDueMetricsSyncTargetsDeps,
): Promise<Result<CampaignMetricsSyncState[], ListDueMetricsSyncTargetsError>> {
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

  const batchLimit = Math.min(Math.max(input.limit || MAX_SYNC_BATCH_SIZE, 1), MAX_SYNC_BATCH_SIZE);

  // 2. Descubrir targets activos de publicaciones exitosas desde el dominio de activaciones de Phase 8
  try {
    const activationsPaginated = await deps.activationRepository.findByOrganization(
      { organizationId: input.organizationId },
      { page: 1, pageSize: 50 },
    );

    const items = activationsPaginated.data || [];
    for (const activation of items) {
      if (activation.status === 'completed' || activation.status === 'partially_completed') {
        const targetsRes = await deps.activationRepository.listTargets(activation.id, input.organizationId);
        if (targetsRes.success) {
          for (const target of targetsRes.value) {
            if (
              target.status === 'published' &&
              target.externalReference &&
              target.externalReference.trim().length > 0
            ) {
              const targetPlatform = target.provider as MetricPlatform;
              if (input.platform && targetPlatform !== input.platform) {
                continue;
              }

              const providerAccId = String(
                target.metadata?.providerAccountId ||
                target.metadata?.customerId ||
                target.metadata?.adAccountId ||
                target.clientIntegrationId ||
                'default_account',
              );

              await deps.syncStateRepository.getOrCreateSyncState({
                organizationId: activation.organizationId,
                clientId: activation.clientId,
                campaignId: activation.campaignId,
                activationId: activation.id,
                targetId: target.id,
                platform: targetPlatform,
                providerAccountId: providerAccId,
                externalCampaignId: target.externalReference,
              });
            }
          }
        }
      }
    }
  } catch (cause) {
    deps.logger.warn('Non-fatal error discovering active activation targets during listDueMetricsSyncTargets', { cause });
  }

  // 3. Consultar los registros vencidos desde el repositorio de estados de sincronización
  const dueRes = await deps.syncStateRepository.listDueTargets(input.organizationId, input.platform, batchLimit);
  if (!dueRes.success) {
    return err({
      code: 'INTERNAL_ERROR',
      message: `Failed to query due metrics sync states: ${dueRes.error.message}`,
    });
  }

  const nowTime = getNow().getTime();

  const dueStates = dueRes.value.filter((st) => {
    if (st.status === 'syncing') {
      return st.claimExpiresAt !== null && st.claimExpiresAt.getTime() <= nowTime;
    }
    return st.nextEligibleSyncAt.getTime() <= nowTime;
  });

  return ok(dueStates.slice(0, batchLimit));
}
