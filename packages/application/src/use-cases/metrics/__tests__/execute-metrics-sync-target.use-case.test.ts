import { describe, it, expect } from 'vitest';
import type {
  OrganizationId,
  ClientId,
  CampaignId,
  CampaignMetricsSyncStateId,
  CampaignActivationTargetId,
  CampaignMetricsSyncState,
  CampaignMetricsSyncStateRepository,
  CreateMetricsSyncStateInput,
  MarkSyncSuccessInput,
  MarkSyncFailureInput,
  ClaimDueTargetResult,
  CampaignMetricSnapshotRepository,
} from '@bop-agency/domain';
import { campaignMetricsSyncStateId, organizationId, campaignActivationId, campaignActivationTargetId } from '@bop-agency/domain';
import { ok, err } from '@bop-agency/shared';
import type { Result, MetricPlatform } from '@bop-agency/shared';
import type { LoggerPort } from '../../../ports/logger.port';
import { InMemoryMetricsProviderRegistry } from '../../../testing/in-memory-metrics-provider-registry';
import { FakeMetricsProvider } from '../../../testing/fake-metrics-provider';
import { executeMetricsSyncTarget } from '../execute-metrics-sync-target.use-case';

const mockLogger: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

class InMemoryMetricsSyncStateRepository implements CampaignMetricsSyncStateRepository {
  public states: Map<string, CampaignMetricsSyncState> = new Map();

  async getOrCreateSyncState(input: CreateMetricsSyncStateInput): Promise<Result<CampaignMetricsSyncState>> {
    const key = String(input.targetId);
    let state = this.states.get(key);
    if (!state) {
      const now = new Date();
      state = {
        id: campaignMetricsSyncStateId(`sync-snap-${Date.now()}`),
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
    const st = this.states.get(String(targetId));
    return st ? ok(st) : err({ code: 'NOT_FOUND', message: 'Not found' });
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

  async listDueTargetsGlobal(platform?: MetricPlatform | null, limit = 50): Promise<Result<CampaignMetricsSyncState[]>> {
    const res: CampaignMetricsSyncState[] = [];
    for (const st of this.states.values()) {
      if (!platform || st.platform === platform) {
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

describe('executeMetricsSyncTarget Use Case (Phase 9B.4)', () => {
  const orgId = organizationId('org-sched-exec-100');
  const cliId = 'cli-sched-exec-200' as ClientId;
  const cmpId = 'cmp-sched-exec-300' as CampaignId;
  const actId = campaignActivationId('act-sched-exec-400');
  const trgId = campaignActivationTargetId('trg-sched-exec-500');

  it('allows trusted system principal execution without human membership lookup', async () => {
    const syncRepo = new InMemoryMetricsSyncStateRepository();
    const createRes = await syncRepo.getOrCreateSyncState({
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgId,
      platform: 'google',
      providerAccountId: '1234567890',
      externalCampaignId: 'ext-google-777',
    });

    expect(createRes.success).toBe(true);
    if (!createRes.success) return;

    const syncState = createRes.value;

    const mockSnapshotRepo = {
      upsertBatch: async () => ok([]),
    } as unknown as CampaignMetricSnapshotRepository;

    const provider = new FakeMetricsProvider({ platform: 'google', pages: [{ records: [], nextCursor: null }] });
    const registry = new InMemoryMetricsProviderRegistry();
    registry.register(provider);

    const res = await executeMetricsSyncTarget(
      {
        principal: { type: 'system', systemId: 'metrics_scheduler' },
        organizationId: orgId,
        syncStateId: syncState.id,
        claimToken: 'token-system-1',
      },
      {
        syncStateRepository: syncRepo,
        snapshotRepository: mockSnapshotRepo,
        providerRegistry: registry,
        logger: mockLogger,
        now: () => new Date('2026-08-30T12:00:00Z'),
      },
    );

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value.status).toBe('succeeded');
    }
  });

  it('denies user principal execution when isOrganizationMember returns false', async () => {
    const syncRepo = new InMemoryMetricsSyncStateRepository();
    const createRes = await syncRepo.getOrCreateSyncState({
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgId,
      platform: 'google',
      providerAccountId: '1234567890',
      externalCampaignId: 'ext-google-777',
    });

    expect(createRes.success).toBe(true);
    if (!createRes.success) return;

    const syncState = createRes.value;

    const mockSnapshotRepo = { upsertBatch: async () => ok([]) } as unknown as CampaignMetricSnapshotRepository;
    const provider = new FakeMetricsProvider({ platform: 'google', pages: [{ records: [], nextCursor: null }] });
    const registry = new InMemoryMetricsProviderRegistry();
    registry.register(provider);

    const res = await executeMetricsSyncTarget(
      {
        principal: { type: 'user', userId: 'user-hacker' },
        organizationId: orgId,
        syncStateId: syncState.id,
        claimToken: 'token-user-denied',
      },
      {
        syncStateRepository: syncRepo,
        snapshotRepository: mockSnapshotRepo,
        providerRegistry: registry,
        isOrganizationMember: async () => false,
        logger: mockLogger,
      },
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('denies system principal when organization resource mismatch occurs', async () => {
    const syncRepo = new InMemoryMetricsSyncStateRepository();
    const createRes = await syncRepo.getOrCreateSyncState({
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgId,
      platform: 'google',
      providerAccountId: '1234567890',
      externalCampaignId: 'ext-google-777',
    });

    expect(createRes.success).toBe(true);
    if (!createRes.success) return;

    const syncState = createRes.value;
    const wrongOrgId = organizationId('org-wrong-999');

    const mockSnapshotRepo = { upsertBatch: async () => ok([]) } as unknown as CampaignMetricSnapshotRepository;
    const provider = new FakeMetricsProvider({ platform: 'google', pages: [{ records: [], nextCursor: null }] });
    const registry = new InMemoryMetricsProviderRegistry();
    registry.register(provider);

    const res = await executeMetricsSyncTarget(
      {
        principal: { type: 'system', systemId: 'metrics_scheduler' },
        organizationId: wrongOrgId,
        syncStateId: syncState.id,
        claimToken: 'token-mismatch-org',
      },
      {
        syncStateRepository: syncRepo,
        snapshotRepository: mockSnapshotRepo,
        providerRegistry: registry,
        logger: mockLogger,
      },
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('Phase 9B.5: propagates externalCampaignId and activationId from syncState to provider fetch request', async () => {
    const syncRepo = new InMemoryMetricsSyncStateRepository();
    const createRes = await syncRepo.getOrCreateSyncState({
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgId,
      platform: 'meta',
      providerAccountId: 'act-meta-123456',
      externalCampaignId: 'meta-remote-campaign-999888',
    });

    expect(createRes.success).toBe(true);
    if (!createRes.success) return;

    const syncState = createRes.value;

    const mockSnapshotRepo = {
      upsertBatch: async () => ok([]),
    } as unknown as CampaignMetricSnapshotRepository;

    const provider = new FakeMetricsProvider({ platform: 'meta', pages: [{ records: [], nextCursor: null }] });
    const registry = new InMemoryMetricsProviderRegistry();
    registry.register(provider);

    const res = await executeMetricsSyncTarget(
      {
        principal: { type: 'system', systemId: 'metrics_scheduler' },
        organizationId: orgId,
        syncStateId: syncState.id,
        claimToken: 'token-propagation-test',
      },
      {
        syncStateRepository: syncRepo,
        snapshotRepository: mockSnapshotRepo,
        providerRegistry: registry,
        logger: mockLogger,
        now: () => new Date('2026-08-30T12:00:00Z'),
      },
    );

    expect(res.success).toBe(true);
    expect(provider.receivedRequests.length).toBe(1);
    const receivedReq = provider.receivedRequests[0];
    expect(receivedReq?.externalCampaignId).toBe('meta-remote-campaign-999888');
    expect(receivedReq?.activationId).toBe(actId);
    expect(receivedReq?.campaignId).toBe(cmpId);
  });
});
