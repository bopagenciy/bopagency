import { describe, it, expect, beforeEach } from 'vitest';
import { ok } from '@bop-agency/shared';
import type {
  OrganizationId,
  ClientId,
  CampaignId,
  CampaignMetricSnapshotRepository,
  SaveCampaignMetricSnapshotInput,
} from '@bop-agency/domain';
import {
  syncCampaignMetrics,
  InMemoryMetricsProviderRegistry,
  type LoggerPort,
} from '../../../../application/src/index';
import { GoogleMetricsAdapter } from '../google-metrics.adapter';

const mockLogger: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

class TestSnapshotRepository implements Partial<CampaignMetricSnapshotRepository> {
  public savedInputs: SaveCampaignMetricSnapshotInput[] = [];

  async upsertBatch(inputs: SaveCampaignMetricSnapshotInput[]) {
    this.savedInputs.push(...inputs);
    return ok(inputs as unknown as ReturnType<CampaignMetricSnapshotRepository['upsertBatch']> extends Promise<infer R> ? R extends { success: true; value: infer V } ? V : never : never);
  }
}

describe('Google Metrics Ingestion Pipeline Integration (Phase 9B.2)', () => {
  const orgId = 'org-pipeline-100' as OrganizationId;
  const cliId = 'cli-pipeline-200' as ClientId;
  const cmpId = 'campaign-internal-300' as CampaignId;
  const externalGoogleCmpId = '9876543210';
  const userId = 'user-pipeline-1';

  let repo: TestSnapshotRepository;
  let registry: InMemoryMetricsProviderRegistry;

  beforeEach(() => {
    repo = new TestSnapshotRepository();
    registry = new InMemoryMetricsProviderRegistry();
  });

  it('proves end-to-end integration: Google Ads GAQL HTTP payload -> GoogleMetricsAdapter -> syncCampaignMetrics -> repository upsert', async () => {
    // 1. Mock de HTTP transport de Google Ads API (GAQL search response)
    const mockGoogleFetch = async () => {
      return new Response(
        JSON.stringify({
          results: [
            {
              campaign: { id: externalGoogleCmpId },
              customer: { currencyCode: 'USD' },
              segments: { date: '2026-08-29' },
              metrics: {
                impressions: '1500',
                clicks: '75',
                cost_micros: '2500000', // $2.50
                conversions: '4',
              },
            },
            {
              campaign: { id: externalGoogleCmpId },
              customer: { currencyCode: 'USD' },
              segments: { date: '2026-08-30' },
              metrics: {
                impressions: '3000',
                clicks: '150',
                cost_micros: '5000000', // $5.00
                conversions: '8',
              },
            },
          ],
          nextPageToken: null,
        }),
        { status: 200 },
      );
    };

    // 2. Resolver que mapea campaignId interno ('campaign-internal-300') a ID externo de Google Ads ('9876543210')
    const resolveExternalCampaignId = async () =>
      ok({
        externalCampaignId: externalGoogleCmpId,
        providerAccountId: '1234567890',
        organizationId: orgId,
        clientId: cliId,
      });

    // 3. Instanciar GoogleMetricsAdapter y registrarlo en el registro de proveedores
    const googleAdapter = new GoogleMetricsAdapter({
      getCredentials: async () =>
        ok({
          accessToken: 'test_google_access_token',
          developerToken: 'test_google_dev_token',
        }),
      resolveExternalCampaignId,
      fetchFn: mockGoogleFetch as unknown as typeof fetch,
    });
    registry.register(googleAdapter);

    // 4. Ejecutar el caso de uso syncCampaignMetrics de la capa de aplicación usando campaignId interno
    const result = await syncCampaignMetrics(
      {
        actorUserId: userId,
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'google',
        providerAccountId: '1234567890',
        startDate: '2026-08-29',
        endDate: '2026-08-30',
      },
      {
        snapshotRepository: repo as unknown as CampaignMetricSnapshotRepository,
        providerRegistry: registry,
        isOrganizationMember: async () => true,
        logger: mockLogger,
      },
    );

    // 5. Assertions del resumen del caso de uso
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recordsFetched).toBe(2);
      expect(result.value.recordsSaved).toBe(2);
      expect(result.value.platform).toBe('google');
    }

    // 6. Assertions de la persistencia enviada al repositorio
    expect(repo.savedInputs.length).toBe(2);

    // Día 1 (2026-08-29)
    const snap1 = repo.savedInputs[0];
    expect(snap1?.organizationId).toBe(orgId);
    expect(snap1?.clientId).toBe(cliId);
    expect(snap1?.platform).toBe('google');
    expect(snap1?.campaignId).toBe(cmpId); // ID interna de BopAgency ('campaign-internal-300')
    expect(snap1?.providerAccountId).toBe('1234567890'); // Customer ID canónico puro de 10 dígitos
    expect(snap1?.externalCampaignId).toBe(externalGoogleCmpId); // ID externa de Google Ads ('9876543210')
    expect(snap1?.currency).toBe('USD');
    expect(snap1?.metrics.spend).toBe('2.50');
    expect(snap1?.metrics.impressions).toBe(1500);
    expect(snap1?.metrics.clicks).toBe(75);
    expect(snap1?.metrics.conversions).toBe(4);
    expect(snap1?.metrics.leads).toBeNull();
    expect(snap1?.metrics.reach).toBeNull();
    expect(snap1?.metrics.revenue).toBeNull();
    // CTR = (75 / 1500) * 100 = 5%
    expect(snap1?.metrics.ctr).toBe(5);

    // Día 2 (2026-08-30)
    const snap2 = repo.savedInputs[1];
    expect(snap2?.metrics.spend).toBe('5.00');
    expect(snap2?.metrics.impressions).toBe(3000);
    expect(snap2?.metrics.clicks).toBe(150);
    expect(snap2?.metrics.conversions).toBe(8);
  });
});
