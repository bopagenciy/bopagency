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
import { executeMetricsSyncBatch } from '../execute-metrics-sync-batch.use-case';

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

describe('executeMetricsSyncBatch Use Case (Phase 9B.4)', () => {
  const orgA = organizationId('org-batch-A');
  const orgB = organizationId('org-batch-B');
  const cliId = 'cli-batch-10' as ClientId;
  const cmpId = 'cmp-batch-10' as CampaignId;
  const actId = campaignActivationId('act-batch-10');
  const trgIdMeta = campaignActivationTargetId('trg-meta-1');
  const trgIdGoogle = campaignActivationTargetId('trg-google-1');

  it('handles zero due targets cleanly with zero counts', async () => {
    const syncRepo = new InMemoryMetricsSyncStateRepository();
    const mockSnapshotRepo = { upsertBatch: async () => ok([]) } as unknown as CampaignMetricSnapshotRepository;
    const registry = new InMemoryMetricsProviderRegistry();

    const res = await executeMetricsSyncBatch(
      { principal: { type: 'system', systemId: 'metrics_scheduler' } },
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
      expect(res.value.discovered).toBe(0);
      expect(res.value.claimed).toBe(0);
      expect(res.value.succeeded).toBe(0);
      expect(res.value.failed).toBe(0);
    }
  });

  it('processes multi-tenant candidates, meta/google provider mix, and partial target failure isolation', async () => {
    const syncRepo = new InMemoryMetricsSyncStateRepository();

    // Seed Meta target for Org A
    await syncRepo.getOrCreateSyncState({
      organizationId: orgA,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgIdMeta,
      platform: 'meta',
      providerAccountId: 'act_meta_1',
      externalCampaignId: 'meta_cmp_1',
    });

    // Seed Google target for Org B
    await syncRepo.getOrCreateSyncState({
      organizationId: orgB,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgIdGoogle,
      platform: 'google',
      providerAccountId: '1234567890',
      externalCampaignId: 'google_cmp_1',
    });

    const mockSnapshotRepo = { upsertBatch: async () => ok([]) } as unknown as CampaignMetricSnapshotRepository;

    const metaProvider = new FakeMetricsProvider({
      platform: 'meta',
      pages: [{ records: [], nextCursor: null }],
    });

    const googleProvider = new FakeMetricsProvider({
      platform: 'google',
      errorToReturn: { category: 'TRANSIENT_FAILURE', message: 'Temporary network timeout', isRetryable: true },
    });

    const registry = new InMemoryMetricsProviderRegistry();
    registry.register(metaProvider);
    registry.register(googleProvider);

    const res = await executeMetricsSyncBatch(
      { principal: { type: 'system', systemId: 'metrics_scheduler' }, batchSize: 10 },
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
      expect(res.value.discovered).toBe(2);
      expect(res.value.claimed).toBe(2);
      expect(res.value.succeeded).toBe(1); // Meta succeeded
      expect(res.value.failed).toBe(1);    // Google failed transiently
      expect(res.value.targetSummaries.length).toBe(2);
    }
  });

  it('respects execution deadline and defers remaining targets when time budget is exhausted', async () => {
    const syncRepo = new InMemoryMetricsSyncStateRepository();

    for (let i = 0; i < 5; i++) {
      await syncRepo.getOrCreateSyncState({
        organizationId: orgA,
        clientId: cliId,
        campaignId: cmpId,
        activationId: actId,
        targetId: campaignActivationTargetId(`trg-deadline-${i}`),
        platform: 'meta',
        providerAccountId: 'act_meta_1',
        externalCampaignId: `meta_cmp_${i}`,
      });
    }

    const mockSnapshotRepo = { upsertBatch: async () => ok([]) } as unknown as CampaignMetricSnapshotRepository;
    const metaProvider = new FakeMetricsProvider({ platform: 'meta', pages: [{ records: [], nextCursor: null }] });
    const registry = new InMemoryMetricsProviderRegistry();
    registry.register(metaProvider);

    // Pass a 0ms deadline so after check remaining budget, all 5 are deferred
    const res = await executeMetricsSyncBatch(
      { principal: { type: 'system', systemId: 'metrics_scheduler' }, deadlineMs: 0 },
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
      expect(res.value.discovered).toBe(5);
      expect(res.value.deferred).toBe(5);
    }
  });
});
