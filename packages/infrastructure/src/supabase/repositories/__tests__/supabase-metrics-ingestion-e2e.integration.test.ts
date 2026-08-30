import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationId, ClientId, CampaignId } from '@bop-agency/domain';
import {
  syncCampaignMetrics,
  InMemoryMetricsProviderRegistry,
  FakeMetricsProvider,
  type NormalizedMetricRecord,
  type LoggerPort,
} from '../../../../../application/src/index';
import { SupabaseCampaignMetricSnapshotRepository } from '../supabase-campaign-metric-snapshot.repository';

const SHOULD_RUN_REAL_DB = process.env.RUN_REAL_DB_TESTS === 'true';

// Environment-gated real database integration test suite
describe.skipIf(!SHOULD_RUN_REAL_DB)(
  'Real Application -> PostgreSQL Metrics Ingestion E2E Proof (Phase 9B.0)',
  () => {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54721';
    const SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

    const mockLogger: LoggerPort = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const repo = new SupabaseCampaignMetricSnapshotRepository(supabase as unknown as SupabaseClient);
    const registry = new InMemoryMetricsProviderRegistry();

    const orgId = 'a0000000-0000-0000-0000-000000000001' as OrganizationId;
    const cliId = 'b0000000-0000-0000-0000-000000000001' as ClientId;
    const cmpId = 'c0000000-0000-0000-0000-000000000001' as CampaignId;
    const userId = '208779e6-081e-4a92-8971-2b1a19fb6f3d';

    beforeAll(async () => {
      // Seed test org, client, campaign
      const { error: err1 } = await supabase.from('organizations').upsert({
        id: orgId,
        name: '9B E2E Org',
        slug: '9b-e2e-org',
      });
      if (err1) throw new Error(`Integration test setup failed on organizations table: ${err1.message}`);

      const { error: err2 } = await supabase.from('clients').upsert({
        id: cliId,
        organization_id: orgId,
        name: '9B E2E Client',
        slug: '9b-e2e-client',
        timezone: 'UTC',
        currency: 'COP',
        created_by: userId,
      });
      if (err2) throw new Error(`Integration test setup failed on clients table: ${err2.message}`);

      const { error: err3 } = await supabase.from('campaigns').upsert({
        id: cmpId,
        organization_id: orgId,
        client_id: cliId,
        name: '9B E2E Campaign',
        platform: 'meta_ads',
        objective: 'traffic',
        budget: 50000.00,
        created_by: userId,
      });
      if (err3) throw new Error(`Integration test setup failed on campaigns table: ${err3.message}`);
    });

    afterAll(async () => {
      await supabase.from('campaign_metric_snapshots').delete().eq('organization_id', orgId);
    });

    it('proves end-to-end ingestion: application use-case -> domain calculation -> repository -> PostgreSQL', async () => {
      // Stream 1 (Meta Campaign Stream)
      const rec1: NormalizedMetricRecord = {
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'meta',
        providerAccountId: 'act_e2e_111',
        externalCampaignId: 'ext_cmp_e2e_1',
        snapshotDate: '2026-08-30',
        spend: '1234.57',
        impressions: 1000,
        reach: 800,
        clicks: 50,
        leads: 5,
        conversions: 2,
        revenue: '5000.00',
      };

      // Stream 2 (Meta Account Stream coexisting)
      const rec2: NormalizedMetricRecord = {
        organizationId: orgId,
        clientId: cliId,
        campaignId: null,
        scope: 'account',
        platform: 'meta',
        providerAccountId: 'act_e2e_222',
        externalCampaignId: null,
        snapshotDate: '2026-08-30',
        spend: '3000.00',
        impressions: 10000,
        reach: 8000,
        clicks: 500,
        leads: 20,
        conversions: 10,
        revenue: '12000.00',
      };

      const provider = new FakeMetricsProvider({
        platform: 'meta',
        pages: [{ records: [rec1, rec2], nextCursor: null }],
      });
      registry.register(provider);

      const deps = {
        snapshotRepository: repo,
        providerRegistry: registry,
        isOrganizationMember: async () => true,
        logger: mockLogger,
      };

      // Execution 1: Initial Sync
      const syncRes1 = await syncCampaignMetrics(
        {
          actorUserId: userId,
          organizationId: orgId,
          clientId: cliId,
          platform: 'meta',
          startDate: '2026-08-30',
          endDate: '2026-08-30',
        },
        deps,
      );

      expect(syncRes1.success).toBe(true);
      if (syncRes1.success) {
        expect(syncRes1.value.recordsFetched).toBe(2);
        expect(syncRes1.value.recordsSaved).toBe(2);
      }

      // Inspect real database rows via Supabase client
      const { data: dbRows1 } = await supabase
        .from('campaign_metric_snapshots')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });

      expect(dbRows1?.length).toBe(2);
      // Check Stream 1: Exact monetary string, exact derived ratio CTR = (50/1000)*100 = 5%
      const stream1 = dbRows1?.find((r) => r.provider_account_id === 'act_e2e_111');
      expect(stream1).toBeDefined();
      expect(stream1?.spend).toBe(1234.57);
      expect(stream1?.revenue).toBe(5000.00);
      expect(stream1?.ctr).toBe(5.0000);
      expect(stream1?.scope).toBe('campaign');

      // Execution 2: Re-sync update (Idempotent UPSERT with updated spend)
      const rec1Updated: NormalizedMetricRecord = {
        ...rec1,
        spend: '1500.00',
      };

      const providerUpdated = new FakeMetricsProvider({
        platform: 'meta',
        pages: [{ records: [rec1Updated], nextCursor: null }],
      });
      const registry2 = new InMemoryMetricsProviderRegistry();
      registry2.register(providerUpdated);

      const syncRes2 = await syncCampaignMetrics(
        {
          actorUserId: userId,
          organizationId: orgId,
          clientId: cliId,
          platform: 'meta',
          startDate: '2026-08-30',
          endDate: '2026-08-30',
        },
        { ...deps, providerRegistry: registry2 },
      );

      expect(syncRes2.success).toBe(true);

      const { data: dbRows2 } = await supabase
        .from('campaign_metric_snapshots')
        .select('*')
        .eq('organization_id', orgId);

      // Total count remains 2 (idempotent row update!)
      expect(dbRows2?.length).toBe(2);
      const updatedStream1 = dbRows2?.find((r) => r.provider_account_id === 'act_e2e_111');
      expect(updatedStream1?.spend).toBe(1500.00);
    });
  },
);
