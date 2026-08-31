import { describe, it, expect } from 'vitest';
import type {
  OrganizationId,
  ClientId,
  CampaignId,
  CampaignMetricsSyncStateId,
  CampaignActivationTargetId,
  CampaignMetricsSyncState,
  CampaignMetricsSyncStateRepository,
  CampaignActivationRepository,
  CreateMetricsSyncStateInput,
  MarkSyncSuccessInput,
  MarkSyncFailureInput,
  ClaimDueTargetResult,
} from '@bop-agency/domain';
import { campaignMetricsSyncStateId, organizationId, campaignActivationId, campaignActivationTargetId } from '@bop-agency/domain';
import { ok, err } from '@bop-agency/shared';
import type { Result, MetricPlatform } from '@bop-agency/shared';
import type { LoggerPort } from '../../../ports/logger.port';
import { listDueMetricsSyncTargets } from '../list-due-metrics-sync-targets.use-case';

const mockLogger: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

class InMemoryMetricsSyncStateRepository implements CampaignMetricsSyncStateRepository {
  public states: Map<string, CampaignMetricsSyncState> = new Map();

  async getOrCreateSyncState(input: CreateMetricsSyncStateInput): Promise<Result<CampaignMetricsSyncState>> {
    const key = `${input.organizationId}:${input.targetId}`;
    let state = this.states.get(key);
    if (!state) {
      const now = new Date();
      state = {
        id: campaignMetricsSyncStateId(`sync-snap-${Date.now()}-${Math.random()}`),
        organizationId: input.organizationId,
        clientId: input.clientId,
        campaignId: input.campaignId,
        activationId: input.activationId,
        targetId: input.targetId,
        platform: input.platform,
        providerAccountId: input.providerAccountId,
        externalCampaignId: input.externalCampaignId,
        scope: 'campaign',
        granularity: 'daily',
        status: 'never_synced',
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastSyncedThroughDate: null,
        nextEligibleSyncAt: now,
        consecutiveFailures: 0,
        claimToken: null,
        claimedAt: null,
        claimExpiresAt: null,
        lastErrorCategory: null,
        lastErrorMessage: null,
        createdAt: now,
        updatedAt: now,
      };
      this.states.set(key, state);
    }
    return ok(state);
  }

  async findById(id: CampaignMetricsSyncStateId): Promise<Result<CampaignMetricsSyncState>> {
    for (const st of this.states.values()) {
      if (st.id === id) return ok(st);
    }
    return err({ code: 'NOT_FOUND', message: 'Not found' });
  }

  async findByTargetId(targetId: CampaignActivationTargetId): Promise<Result<CampaignMetricsSyncState>> {
    for (const st of this.states.values()) {
      if (st.targetId === targetId) return ok(st);
    }
    return err({ code: 'NOT_FOUND', message: 'Not found' });
  }

  async listDueTargets(orgId: OrganizationId, platform?: MetricPlatform | null, limit = 50): Promise<Result<CampaignMetricsSyncState[]>> {
    const res: CampaignMetricsSyncState[] = [];
    for (const st of this.states.values()) {
      if (st.organizationId === orgId && (!platform || st.platform === platform)) {
        res.push(st);
      }
    }
    return ok(res.slice(0, limit));
  }

  async claimDueTarget(syncStateId: CampaignMetricsSyncStateId, claimToken: string): Promise<Result<ClaimDueTargetResult>> {
    for (const [key, st] of this.states.entries()) {
      if (st.id === syncStateId) {
        if (st.status === 'syncing' && st.claimToken !== claimToken) {
          return ok({ claimed: false, syncState: null });
        }
        const updated: CampaignMetricsSyncState = {
          ...st,
          status: 'syncing',
          claimToken,
          claimedAt: new Date(),
          claimExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        };
        this.states.set(key, updated);
        return ok({ claimed: true, syncState: updated });
      }
    }
    return ok({ claimed: false, syncState: null });
  }

  async markSuccess(input: MarkSyncSuccessInput): Promise<Result<CampaignMetricsSyncState>> {
    for (const [key, st] of this.states.entries()) {
      if (st.id === input.syncStateId) {
        if (st.status === 'syncing' && st.claimToken !== input.claimToken) {
          return err({ code: 'CONFLICT', message: 'Stale claim token mismatch' });
        }
        const updated: CampaignMetricsSyncState = {
          ...st,
          status: 'fresh',
          lastAttemptAt: input.attemptedAt,
          lastSuccessAt: input.attemptedAt,
          lastSyncedThroughDate: input.syncedThroughDate,
          nextEligibleSyncAt: input.nextEligibleSyncAt,
          consecutiveFailures: 0,
          claimToken: null,
          claimedAt: null,
          claimExpiresAt: null,
          lastErrorCategory: null,
          lastErrorMessage: null,
        };
        this.states.set(key, updated);
        return ok(updated);
      }
    }
    return err({ code: 'NOT_FOUND', message: 'Not found' });
  }

  async markFailure(input: MarkSyncFailureInput): Promise<Result<CampaignMetricsSyncState>> {
    for (const [key, st] of this.states.entries()) {
      if (st.id === input.syncStateId) {
        if (st.status === 'syncing' && st.claimToken !== input.claimToken) {
          return err({ code: 'CONFLICT', message: 'Stale claim token mismatch' });
        }
        const updated: CampaignMetricsSyncState = {
          ...st,
          status: 'backoff',
          lastAttemptAt: input.attemptedAt,
          lastFailureAt: input.attemptedAt,
          nextEligibleSyncAt: input.nextEligibleSyncAt,
          consecutiveFailures: st.consecutiveFailures + 1,
          claimToken: null,
          claimedAt: null,
          claimExpiresAt: null,
          lastErrorCategory: input.errorCategory,
          lastErrorMessage: input.errorMessage,
        };
        this.states.set(key, updated);
        return ok(updated);
      }
    }
    return err({ code: 'NOT_FOUND', message: 'Not found' });
  }
}

describe('listDueMetricsSyncTargets Use Case (Phase 9B.3)', () => {
  const orgId = organizationId('org-sched-100');
  const cliId = 'cli-sched-200' as ClientId;
  const cmpId = 'cmp-sched-300' as CampaignId;
  const actId = campaignActivationId('act-sched-400');
  const trgId = campaignActivationTargetId('trg-sched-500');

  it('rejects unauthorized actor users', async () => {
    const syncRepo = new InMemoryMetricsSyncStateRepository();
    const mockActivationRepo = {} as CampaignActivationRepository;

    const res = await listDueMetricsSyncTargets(
      { actorUserId: 'user-unauth', organizationId: orgId },
      {
        syncStateRepository: syncRepo,
        activationRepository: mockActivationRepo,
        isOrganizationMember: async () => false,
        logger: mockLogger,
      },
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('returns due metrics sync state targets for authorized organization members', async () => {
    const syncRepo = new InMemoryMetricsSyncStateRepository();
    await syncRepo.getOrCreateSyncState({
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgId,
      platform: 'google',
      providerAccountId: '1234567890',
      externalCampaignId: 'ext-cmp-999',
    });

    const mockActivationRepo = {
      findByOrganization: async () => ({ data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }),
    } as unknown as CampaignActivationRepository;

    const res = await listDueMetricsSyncTargets(
      { actorUserId: 'user-auth', organizationId: orgId },
      {
        syncStateRepository: syncRepo,
        activationRepository: mockActivationRepo,
        isOrganizationMember: async () => true,
        logger: mockLogger,
        now: () => new Date('2026-08-30T12:00:00Z'),
      },
    );

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value.length).toBe(1);
      expect(res.value[0]?.targetId).toBe(trgId);
      expect(res.value[0]?.status).toBe('never_synced');
    }
  });
});
