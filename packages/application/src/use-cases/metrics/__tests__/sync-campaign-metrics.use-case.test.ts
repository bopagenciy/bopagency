import { describe, it, expect, beforeEach } from 'vitest';
import type {
  OrganizationId,
  ClientId,
  CampaignId,
  CampaignActivationId,
  CampaignMetricSnapshot,
  CampaignMetricSnapshotRepository,
  SaveCampaignMetricSnapshotInput,
} from '@bop-agency/domain';
import { campaignMetricSnapshotId } from '@bop-agency/domain';
import { ok, err, paginate } from '@bop-agency/shared';
import type { Result, PaginatedResult } from '@bop-agency/shared';
import type { LoggerPort } from '../../../ports/logger.port';
import { InMemoryMetricsProviderRegistry } from '../../../testing/in-memory-metrics-provider-registry';
import { FakeMetricsProvider } from '../../../testing/fake-metrics-provider';
import type { NormalizedMetricRecord } from '../../../dtos/normalized-metric-record.dto';
import {
  syncCampaignMetrics,
  diffCalendarDays,
  isValidCalendarDate,
  normalizeAttributedCount,
  MAX_METRICS_SYNC_RANGE_DAYS,
  MAX_PAGINATION_PAGES,
  MAX_CANONICAL_ATTRIBUTED_CONVERSIONS,
  type SyncCampaignMetricsDeps,
} from '../sync-campaign-metrics.use-case';


const mockLogger: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

class InMemorySnapshotRepository implements CampaignMetricSnapshotRepository {
  public savedInputs: SaveCampaignMetricSnapshotInput[] = [];

  async findById(): Promise<Result<CampaignMetricSnapshot>> {
    return err({ code: 'NOT_FOUND', message: 'Not implemented in memory' });
  }

  async findByFilter(): Promise<PaginatedResult<CampaignMetricSnapshot>> {
    return paginate([], 0, { page: 1, pageSize: 20 });
  }

  async save(input: SaveCampaignMetricSnapshotInput): Promise<Result<CampaignMetricSnapshot>> {
    this.savedInputs.push(input);
    return ok(this.inputToEntity(input));
  }

  async upsertBatch(inputs: SaveCampaignMetricSnapshotInput[]): Promise<Result<CampaignMetricSnapshot[]>> {
    this.savedInputs.push(...inputs);
    return ok(inputs.map((inp) => this.inputToEntity(inp)));
  }

  private inputToEntity(inp: SaveCampaignMetricSnapshotInput): CampaignMetricSnapshot {
    return {
      id: campaignMetricSnapshotId('snap-mock-123'),
      organizationId: inp.organizationId,
      clientId: inp.clientId,
      campaignId: inp.campaignId || null,
      activationId: inp.activationId ? (inp.activationId as CampaignActivationId) : null,
      platform: inp.platform,
      providerAccountId: inp.providerAccountId || null,
      externalCampaignId: inp.externalCampaignId || null,
      snapshotDate: inp.snapshotDate,
      granularity: inp.granularity || 'daily',
      scope: inp.scope || 'campaign',
      currency: inp.currency || 'COP',
      metrics: inp.metrics,
      metadata: inp.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

describe('syncCampaignMetrics Hardened Use Case (Phase 9B.0)', () => {
  const orgId = 'org-100' as OrganizationId;
  const cliId = 'cli-200' as ClientId;
  const cmpId = 'cmp-300' as CampaignId;

  let repo: InMemorySnapshotRepository;
  let registry: InMemoryMetricsProviderRegistry;
  let deps: SyncCampaignMetricsDeps;

  beforeEach(() => {
    repo = new InMemorySnapshotRepository();
    registry = new InMemoryMetricsProviderRegistry();
    deps = {
      snapshotRepository: repo,
      providerRegistry: registry,
      isOrganizationMember: async (o: OrganizationId, u: string) => o === orgId && u === 'user-1',
      logger: mockLogger,
    };
  });

  // ─── 1. Date Math & Calendar Validity ───────────────────────────────────────

  it('isValidCalendarDate rejects invalid real calendar dates', () => {
    expect(isValidCalendarDate('2026-08-30')).toBe(true);
    expect(isValidCalendarDate('2026-02-28')).toBe(true);
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
    expect(isValidCalendarDate('2026-00-10')).toBe(false);
    expect(isValidCalendarDate('2026-04-31')).toBe(false);
  });

  it('diffCalendarDays computes exact inclusive calendar days without timezone shifts', () => {
    expect(diffCalendarDays('2026-01-01', '2026-01-01')).toBe(1);
    expect(diffCalendarDays('2026-01-01', '2026-01-31')).toBe(31);
    expect(diffCalendarDays('2026-01-01', '2026-03-31')).toBe(90);
    expect(diffCalendarDays('2026-01-01', '2026-04-01')).toBe(91);
  });

  it('90-day range is accepted, 91-day range is rejected', async () => {
    const provider = new FakeMetricsProvider({ platform: 'meta', pages: [{ records: [], nextCursor: null }] });
    registry.register(provider);

    const okRes = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      },
      deps,
    );
    expect(okRes.success).toBe(true);

    const errRes = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-01-01',
        endDate: '2026-04-01',
      },
      deps,
    );
    expect(errRes.success).toBe(false);
    if (!errRes.success) {
      expect(errRes.error.code).toBe('INVALID_ARGUMENT');
      expect(errRes.error.message).toContain(`exceeds maximum allowed limit of ${MAX_METRICS_SYNC_RANGE_DAYS} days`);
    }
  });

  // ─── 2. Pagination Termination Safety ────────────────────────────────────────

  it('hasMore=true + null nextCursor is rejected', async () => {
    const provider = new FakeMetricsProvider({ platform: 'meta' });
    provider.fetchMetrics = async () =>
      ok({
        records: [],
        nextCursor: null,
        hasMore: true,
      });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('PROVIDER_ERROR');
      expect(res.error.message).toContain('hasMore=true but nextCursor is null or empty');
    }
  });

  it('repeated identical nextCursor is rejected (infinite self loop)', async () => {
    const provider = new FakeMetricsProvider({ platform: 'meta' });
    provider.fetchMetrics = async () =>
      ok({
        records: [],
        nextCursor: 'same-cursor',
        hasMore: true,
      });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('PROVIDER_ERROR');
      expect(res.error.message).toContain('nextCursor equals current pageCursor');
    }
  });

  it('cursor cycle (A -> B -> A) is rejected', async () => {
    const provider = new FakeMetricsProvider({ platform: 'meta' });
    let calls = 0;
    provider.fetchMetrics = async () => {
      calls += 1;
      const nextCursor = calls === 1 ? 'cursor-A' : calls === 2 ? 'cursor-B' : 'cursor-A';
      return ok({
        records: [],
        nextCursor,
        hasMore: true,
      });
    };
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('PROVIDER_ERROR');
      expect(res.error.message).toContain('cursor cycle detected');
    }
  });

  it('page 50 is accepted and page 51 is rejected (MAX_PAGINATION_PAGES = 50 guard)', async () => {
    const provider = new FakeMetricsProvider({ platform: 'meta' });
    let calls = 0;
    provider.fetchMetrics = async () => {
      calls += 1;
      if (calls === 50) {
        return ok({ records: [], nextCursor: null, hasMore: false });
      }
      return ok({ records: [], nextCursor: `page-${calls}`, hasMore: true });
    };
    registry.register(provider);

    const res50 = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );
    expect(res50.success).toBe(true);
    if (res50.success) {
      expect(res50.value.pagesFetched).toBe(50);
    }

    // Now test provider attempting 51 pages
    const provider51 = new FakeMetricsProvider({ platform: 'meta' });
    let calls51 = 0;
    provider51.fetchMetrics = async () => {
      calls51 += 1;
      return ok({ records: [], nextCursor: `page-${calls51}`, hasMore: true });
    };
    const reg51 = new InMemoryMetricsProviderRegistry();
    reg51.register(provider51);

    const res51 = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      { ...deps, providerRegistry: reg51 },
    );
    expect(res51.success).toBe(false);
    if (!res51.success) {
      expect(res51.error.code).toBe('PROVIDER_ERROR');
      expect(res51.error.message).toContain(`safety guard of ${MAX_PAGINATION_PAGES} pages`);
    }
    expect(repo.savedInputs.length).toBe(0);
  });

  // ─── 3. Partial Pagination Failure Semantics ────────────────────────────────

  it('page 3 failure aborts atomically with zero database records saved', async () => {
    const rec1: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'meta',
      snapshotDate: '2026-08-28',
      spend: '10.00',
      impressions: 100,
      reach: null,
      clicks: 5,
      leads: null,
      conversions: null,
      revenue: null,
    };
    const rec2: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'meta',
      snapshotDate: '2026-08-29',
      spend: '20.00',
      impressions: 200,
      reach: null,
      clicks: 10,
      leads: null,
      conversions: null,
      revenue: null,
    };

    const provider = new FakeMetricsProvider({ platform: 'meta' });
    let pageCount = 0;
    provider.fetchMetrics = async () => {
      pageCount += 1;
      if (pageCount === 1) {
        return ok({ records: [rec1], nextCursor: 'page-1', hasMore: true });
      }
      if (pageCount === 2) {
        return ok({ records: [rec2], nextCursor: 'page-2', hasMore: true });
      }
      return err({
        category: 'RATE_LIMIT',
        message: 'Meta API rate limit exceeded on page 3',
        isRetryable: true,
      });
    };
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-08-28',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('PROVIDER_ERROR');
      expect(res.error.message).toContain('failed on page 3');
    }
    expect(repo.savedInputs.length).toBe(0);
  });

  // ─── 4. Duplicate Record Semantics ──────────────────────────────────────────

  it('same-page identical duplicate safely collapses', async () => {
    const rec1: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'meta',
      snapshotDate: '2026-08-30',
      spend: '100.00',
      impressions: 1000,
      reach: null,
      clicks: 50,
      leads: null,
      conversions: null,
      revenue: null,
    };
    const rec1Identical = { ...rec1 };

    const provider = new FakeMetricsProvider({
      platform: 'meta',
      pages: [{ records: [rec1, rec1Identical], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value.recordsFetched).toBe(2);
      expect(res.value.recordsSaved).toBe(1);
    }
  });

  it('same-page conflicting duplicate is rejected with INVALID_ARGUMENT', async () => {
    const rec1: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'meta',
      snapshotDate: '2026-08-30',
      spend: '100.00',
      impressions: 1000,
      reach: null,
      clicks: 50,
      leads: null,
      conversions: null,
      revenue: null,
    };
    const rec1Conflicting = { ...rec1, spend: '150.00' };

    const provider = new FakeMetricsProvider({
      platform: 'meta',
      pages: [{ records: [rec1, rec1Conflicting], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('INVALID_ARGUMENT');
      expect(res.error.message).toContain('Conflicting duplicate provider records detected');
    }
    expect(repo.savedInputs.length).toBe(0);
  });

  it('cross-page identical duplicate safely collapses', async () => {
    const rec1: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'meta',
      snapshotDate: '2026-08-30',
      spend: '100.00',
      impressions: 1000,
      reach: null,
      clicks: 50,
      leads: null,
      conversions: null,
      revenue: null,
    };
    const rec1Identical = { ...rec1 };

    const provider = new FakeMetricsProvider({
      platform: 'meta',
      pages: [
        { records: [rec1], nextCursor: 'page-1' },
        { records: [rec1Identical], nextCursor: null },
      ],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value.recordsFetched).toBe(2);
      expect(res.value.recordsSaved).toBe(1);
    }
  });

  it('cross-page conflicting duplicate is rejected with INVALID_ARGUMENT', async () => {
    const rec1: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'meta',
      snapshotDate: '2026-08-30',
      spend: '100.00',
      impressions: 1000,
      reach: null,
      clicks: 50,
      leads: null,
      conversions: null,
      revenue: null,
    };
    const rec1Conflicting = { ...rec1, spend: '200.00' };

    const provider = new FakeMetricsProvider({
      platform: 'meta',
      pages: [
        { records: [rec1], nextCursor: 'page-1' },
        { records: [rec1Conflicting], nextCursor: null },
      ],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('INVALID_ARGUMENT');
      expect(res.error.message).toContain('Conflicting duplicate provider records detected');
    }
    expect(repo.savedInputs.length).toBe(0);
  });

  // ─── 5. Provider Payload & Identity Validation ─────────────────────────────

  it('negative or non-integer primitive metrics are rejected', async () => {
    const invalidRec: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'meta',
      snapshotDate: '2026-08-30',
      spend: '10.00',
      impressions: -50,
      reach: null,
      clicks: 10,
      leads: null,
      conversions: null,
      revenue: null,
    };

    const provider = new FakeMetricsProvider({
      platform: 'meta',
      pages: [{ records: [invalidRec], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('INVALID_ARGUMENT');
      expect(res.error.message).toContain('impressions');
    }
    expect(repo.savedInputs.length).toBe(0);
  });

  it('account-scope snapshot requires providerAccountId and null campaignId', async () => {
    const invalidAccountRec: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      scope: 'account',
      providerAccountId: 'act_123',
      platform: 'meta',
      snapshotDate: '2026-08-30',
      spend: '10.00',
      impressions: 100,
      reach: null,
      clicks: 10,
      leads: null,
      conversions: null,
      revenue: null,
    };

    const provider = new FakeMetricsProvider({
      platform: 'meta',
      pages: [{ records: [invalidAccountRec], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('INVALID_ARGUMENT');
      expect(res.error.message).toContain('Account scope snapshot must have null campaignId');
    }
  });

  it('authorization dependency exception returns INTERNAL_ERROR', async () => {
    const provider = new FakeMetricsProvider({ platform: 'meta' });
    registry.register(provider);

    const failingDeps: SyncCampaignMetricsDeps = {
      ...deps,
      isOrganizationMember: async () => {
        throw new Error('Database connection reset during auth lookup');
      },
    };

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      failingDeps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('INTERNAL_ERROR');
      expect(res.error.message).toContain('Authorization check failed');
    }
  });

  // ─── 6. Baseline Success Requirements ──────────────────────────────────────

  it('single normalized record persists cleanly with exact decimal string and derived ratios', async () => {
    const rec: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'meta',
      providerAccountId: 'act_999',
      externalCampaignId: 'ext_cmp_1',
      snapshotDate: '2026-08-30',
      spend: '1234.57',
      impressions: 1000,
      reach: 800,
      clicks: 50,
      leads: 5,
      conversions: 2,
      revenue: '5000.00',
    };

    const provider = new FakeMetricsProvider({
      platform: 'meta',
      pages: [{ records: [rec], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'meta',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(true);
    expect(repo.savedInputs[0]?.metrics.spend).toBe('1234.57');
    expect(repo.savedInputs[0]?.metrics.revenue).toBe('5000.00');
    expect(repo.savedInputs[0]?.metrics.ctr).toBe(5);
  });

  it('null metrics remain null and zero metrics remain zero', async () => {
    const nullRec: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'google',
      snapshotDate: '2026-08-30',
      spend: null,
      impressions: null,
      reach: null,
      clicks: null,
      leads: null,
      conversions: null,
      revenue: null,
    };
    const zeroRec: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'google',
      providerAccountId: 'act_zero',
      externalCampaignId: 'ext_zero',
      snapshotDate: '2026-08-30',
      spend: '0.00',
      impressions: 0,
      reach: 0,
      clicks: 0,
      leads: 0,
      conversions: 0,
      revenue: '0.00',
    };

    const provider = new FakeMetricsProvider({
      platform: 'google',
      pages: [{ records: [nullRec, zeroRec], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'google',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(true);
    expect(repo.savedInputs[0]?.metrics.spend).toBeNull();
    expect(repo.savedInputs[0]?.metrics.impressions).toBeNull();
    expect(repo.savedInputs[1]?.metrics.spend).toBe('0.00');
    expect(repo.savedInputs[1]?.metrics.impressions).toBe(0);
  });

  it('accepts fractional attributed conversion counts (e.g. 2.5 or 0.33) in Sub-Phase 9B.2A', async () => {
    const fractionalRec: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'google',
      providerAccountId: 'act_frac',
      externalCampaignId: 'ext_frac',
      snapshotDate: '2026-08-30',
      spend: '10.00',
      impressions: 100,
      reach: null,
      clicks: 10,
      leads: 2,
      conversions: 2.5, // Conversión atribuida fraccional de Google Ads
      revenue: null,
    };

    const provider = new FakeMetricsProvider({
      platform: 'google',
      pages: [{ records: [fractionalRec], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'google',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(true);
    expect(repo.savedInputs[0]?.metrics.conversions).toBe(2.5);
  });

  it('rejects non-integer leads, impressions, or clicks while accepting fractional conversions', async () => {
    const invalidLeadsRec: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'google',
      providerAccountId: 'act_invalid',
      externalCampaignId: 'ext_invalid',
      snapshotDate: '2026-08-30',
      spend: '10.00',
      impressions: 100,
      reach: null,
      clicks: 10,
      leads: 2.5, // Inválido: los leads deben ser enteros no negativos
      conversions: 2.5,
      revenue: null,
    };

    const provider = new FakeMetricsProvider({
      platform: 'google',
      pages: [{ records: [invalidLeadsRec], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'google',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('INVALID_ARGUMENT');
      expect(res.error.message).toContain("Invalid provider metric 'leads': must be a non-negative integer, got 2.5");
    }
  });

  it('verifies normalizeAttributedCount deterministic half-up decimal rounding and boundary conditions', () => {
    expect(normalizeAttributedCount(null)).toBeNull();
    expect(normalizeAttributedCount(undefined)).toBeNull();
    expect(normalizeAttributedCount(-1)).toBeNull();
    expect(normalizeAttributedCount(NaN)).toBeNull();
    expect(normalizeAttributedCount(Infinity)).toBeNull();

    expect(normalizeAttributedCount(0)).toBe(0);
    expect(normalizeAttributedCount(1)).toBe(1);
    expect(normalizeAttributedCount(2.5)).toBe(2.5);
    expect(normalizeAttributedCount(0.33)).toBe(0.33);
    expect(normalizeAttributedCount(0.3333)).toBe(0.3333);
    expect(normalizeAttributedCount(0.33334)).toBe(0.3333);
    expect(normalizeAttributedCount(0.33335)).toBe(0.3334);
    expect(normalizeAttributedCount(0.33336)).toBe(0.3334);
    expect(normalizeAttributedCount(1.23494)).toBe(1.2349);
    expect(normalizeAttributedCount(1.23495)).toBe(1.235);
    expect(normalizeAttributedCount(1.23496)).toBe(1.235);
    expect(normalizeAttributedCount(9999999999.99994)).toBe(9999999999.9999);
    expect(normalizeAttributedCount(1e-7)).toBe(0);
    expect(normalizeAttributedCount(1.234567e5)).toBe(123456.7);

    // Excede MAX_CANONICAL_ATTRIBUTED_CONVERSIONS (9999999999.9999)
    expect(normalizeAttributedCount(MAX_CANONICAL_ATTRIBUTED_CONVERSIONS + 1)).toBeNull();
  });

  it('proves provider conversions 0.33335 normalizes to 0.3334 end-to-end through syncCampaignMetrics', async () => {
    const providerRec: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'google',
      providerAccountId: 'act_half_up',
      externalCampaignId: 'ext_half_up',
      snapshotDate: '2026-08-30',
      spend: '10.00',
      impressions: 100,
      reach: null,
      clicks: 10,
      leads: null,
      conversions: 0.33335, // Se redondea half-up a 0.3334 en la escala de 4 decimales
      revenue: null,
    };

    const provider = new FakeMetricsProvider({
      platform: 'google',
      pages: [{ records: [providerRec], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'google',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(true);
    expect(repo.savedInputs[0]?.metrics.conversions).toBe(0.3334);
  });

  it('rejects provider conversions exceeding MAX_CANONICAL_ATTRIBUTED_CONVERSIONS', async () => {
    const overflowRec: NormalizedMetricRecord = {
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      platform: 'google',
      providerAccountId: 'act_overflow',
      externalCampaignId: 'ext_overflow',
      snapshotDate: '2026-08-30',
      spend: '10.00',
      impressions: 100,
      reach: null,
      clicks: 10,
      leads: null,
      conversions: 10000000000.0, // Excede MAX_CANONICAL_ATTRIBUTED_CONVERSIONS (9999999999.9999)
      revenue: null,
    };

    const provider = new FakeMetricsProvider({
      platform: 'google',
      pages: [{ records: [overflowRec], nextCursor: null }],
    });
    registry.register(provider);

    const res = await syncCampaignMetrics(
      {
        actorUserId: 'user-1',
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'google',
        startDate: '2026-08-30',
        endDate: '2026-08-30',
      },
      deps,
    );

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('INVALID_ARGUMENT');
      expect(res.error.message).toContain("must be a non-negative finite number <= 9999999999.9999");
    }
  });
});
