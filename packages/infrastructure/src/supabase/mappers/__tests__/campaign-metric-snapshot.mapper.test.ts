import { describe, it, expect } from 'vitest';
import { rowToCampaignMetricSnapshot } from '../campaign-metric-snapshot.mapper';

describe('CampaignMetricSnapshotMapper (Phase 9A.0 Final Corrected)', () => {
  it('maps valid database row to domain CampaignMetricSnapshot entity', () => {
    const entity = rowToCampaignMetricSnapshot({
      id: 'snap-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      campaign_id: 'camp-1',
      activation_id: 'act-10',
      platform: 'meta',
      provider_account_id: 'act_9999',
      external_campaign_id: '1202020202',
      snapshot_date: '2026-08-30',
      granularity: 'daily',
      scope: 'campaign',
      currency: 'COP',
      spend: 150.5,
      impressions: 12000,
      reach: 9500,
      clicks: 340,
      leads: 12,
      conversions: 5,
      revenue: 600,
      ctr: 2.83,
      cpc: 0.44,
      cpm: 12.54,
      roas: 3.98,
      metadata: { source: 'api_sync' },
      created_at: '2026-08-30T10:00:00Z',
      updated_at: '2026-08-30T10:00:00Z',
    });

    expect(entity.id).toBe('snap-1');
    expect(entity.platform).toBe('meta');
    expect(entity.activationId).toBe('act-10');
    expect(entity.providerAccountId).toBe('act_9999');
    expect(entity.externalCampaignId).toBe('1202020202');
    expect(entity.granularity).toBe('daily');
    expect(entity.scope).toBe('campaign');
    expect(entity.metrics.spend).toBe('150.50');
    expect(entity.metrics.revenue).toBe('600.00');
    expect(entity.metrics.clicks).toBe(340);
  });

  it('maps null metrics correctly without coercing to zero', () => {
    const entity = rowToCampaignMetricSnapshot({
      id: 'snap-2',
      organization_id: 'org-1',
      client_id: 'client-1',
      campaign_id: null,
      activation_id: null,
      platform: 'google',
      provider_account_id: null,
      external_campaign_id: null,
      snapshot_date: '2026-08-30',
      granularity: 'daily',
      scope: 'client',
      currency: 'COP',
      spend: null,
      impressions: 100,
      reach: null,
      clicks: 5,
      leads: null,
      conversions: null,
      revenue: null,
      ctr: null,
      cpc: null,
      cpm: null,
      roas: null,
      metadata: {},
      created_at: '2026-08-30T10:00:00Z',
      updated_at: '2026-08-30T10:00:00Z',
    });

    expect(entity.metrics.spend).toBeNull();
    expect(entity.metrics.reach).toBeNull();
    expect(entity.metrics.ctr).toBeNull();
    expect(entity.metrics.impressions).toBe(100);
  });
});
