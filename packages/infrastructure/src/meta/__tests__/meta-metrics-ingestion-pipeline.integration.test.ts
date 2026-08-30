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
import { MetaMetricsAdapter } from '../meta-metrics.adapter';

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

describe('Meta Metrics Ingestion Pipeline Integration (Phase 9B.1 Resource Resolution)', () => {
  const orgId = 'org-pipeline-100' as OrganizationId;
  const cliId = 'cli-pipeline-200' as ClientId;
  const cmpId = 'campaign-internal-300' as CampaignId;
  const externalMetaCmpId = '120213456789012345';
  const userId = 'user-pipeline-1';

  let repo: TestSnapshotRepository;
  let registry: InMemoryMetricsProviderRegistry;

  beforeEach(() => {
    repo = new TestSnapshotRepository();
    registry = new InMemoryMetricsProviderRegistry();
  });

  it('proves end-to-end identity invariant: internal campaign -> external resolution -> Meta filtering -> record persistence', async () => {
    // 1. Mock de HTTP transport de Meta que retorna 2 días de datos para el ID externo de Meta '120213456789012345'
    const mockMetaFetch = async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              campaign_id: externalMetaCmpId,
              account_id: '123456789',
              date_start: '2026-08-29',
              date_stop: '2026-08-29',
              spend: '125.50',
              impressions: '1200',
              reach: '950',
              clicks: '60',
              actions: [
                { action_type: 'lead', value: '8' },
                { action_type: 'purchase', value: '2' },
              ],
              action_values: [{ action_type: 'purchase', value: '350.00' }],
              account_currency: 'USD',
            },
            {
              campaign_id: externalMetaCmpId,
              account_id: '123456789',
              date_start: '2026-08-30',
              date_stop: '2026-08-30',
              spend: '200.00',
              impressions: '2500',
              reach: '1800',
              clicks: '110',
              actions: [
                { action_type: 'lead', value: '12' },
                { action_type: 'purchase', value: '5' },
              ],
              action_values: [{ action_type: 'purchase', value: '800.00' }],
              account_currency: 'USD',
            },
          ],
          paging: {
            cursors: { after: null },
            next: null,
          },
        }),
        { status: 200 },
      );
    };

    // 2. Resolver que mapea campaignId interno ('campaign-internal-300') a ID externo de Meta ('120213456789012345')
    const resolveExternalCampaignId = async () =>
      ok({
        externalCampaignId: externalMetaCmpId,
        providerAccountId: '123456789',
        organizationId: orgId,
        clientId: cliId,
      });

    // 3. Instanciar MetaMetricsAdapter y registrarlo en el registro de proveedores
    const metaAdapter = new MetaMetricsAdapter({
      getAccessToken: async () => ok('test_meta_token_abc'),
      resolveExternalCampaignId,
      fetchFn: mockMetaFetch as unknown as typeof fetch,
    });
    registry.register(metaAdapter);

    // 4. Ejecutar el caso de uso syncCampaignMetrics de la capa de aplicación usando campaignId interno
    const result = await syncCampaignMetrics(
      {
        actorUserId: userId,
        organizationId: orgId,
        clientId: cliId,
        campaignId: cmpId,
        platform: 'meta',
        providerAccountId: '123456789',
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
      expect(result.value.platform).toBe('meta');
    }

    // 6. Assertions de la persistencia enviada al repositorio
    expect(repo.savedInputs.length).toBe(2);

    // Día 1 (2026-08-29)
    const snap1 = repo.savedInputs[0];
    expect(snap1?.organizationId).toBe(orgId);
    expect(snap1?.clientId).toBe(cliId);
    expect(snap1?.platform).toBe('meta');
    expect(snap1?.campaignId).toBe(cmpId); // ID interna de BopAgency ('campaign-internal-300')
    expect(snap1?.providerAccountId).toBe('123456789'); // Canónico puro sin 'act_'
    expect(snap1?.externalCampaignId).toBe(externalMetaCmpId); // ID externa de Meta ('120213456789012345')
    expect(snap1?.currency).toBe('USD');
    expect(snap1?.metrics.spend).toBe('125.50');
    expect(snap1?.metrics.impressions).toBe(1200);
    expect(snap1?.metrics.clicks).toBe(60);
    expect(snap1?.metrics.leads).toBe(8);
    expect(snap1?.metrics.conversions).toBe(2);
    expect(snap1?.metrics.revenue).toBe('350.00');
    // CTR = (60 / 1200) * 100 = 5%
    expect(snap1?.metrics.ctr).toBe(5);

    // Día 2 (2026-08-30)
    const snap2 = repo.savedInputs[1];
    expect(snap2?.metrics.spend).toBe('200.00');
    expect(snap2?.metrics.impressions).toBe(2500);
    expect(snap2?.metrics.clicks).toBe(110);
    expect(snap2?.metrics.leads).toBe(12);
    expect(snap2?.metrics.conversions).toBe(5);
    expect(snap2?.metrics.revenue).toBe('800.00');
  });
});
