import { describe, it, expect, vi } from 'vitest';
import { ok, err } from '@bop-agency/shared';
import type { OrganizationId, ClientId, CampaignId } from '@bop-agency/domain';
import type { MetricsProviderFetchRequest } from '@bop-agency/application';
import { MetaMetricsAdapter } from '../meta-metrics.adapter';

describe('MetaMetricsAdapter (Phase 9B.1 Resource Resolver Integrity Gate)', () => {
  const orgId = 'org-100' as OrganizationId;
  const cliId = 'cli-200' as ClientId;
  const internalCmpId = 'campaign-internal-001' as CampaignId;
  const externalMetaCmpId = '120213456789012345';

  const validRequest: MetricsProviderFetchRequest = {
    organizationId: orgId,
    clientId: cliId,
    campaignId: internalCmpId,
    platform: 'meta',
    providerAccountId: '123456789', // Canónico puro
    startDate: '2026-08-01',
    endDate: '2026-08-30',
    scope: 'campaign',
  };

  const dummyGetAccessToken = async (_orgId: OrganizationId, accountId?: string | null) => {
    if (accountId === '123456789') {
      return ok('secret_access_token_123');
    }
    return err({
      category: 'AUTH_FAILURE' as const,
      message: 'Credential resolution mismatch for provider account',
      isRetryable: false,
    });
  };

  const mockResolver = async () =>
    ok({
      externalCampaignId: externalMetaCmpId,
      providerAccountId: '123456789',
      organizationId: orgId,
      clientId: cliId,
    });

  it('REQUIRED: fails deterministically BEFORE HTTP fetch when resolver is absent', async () => {
    const mockFetch = vi.fn();
    const adapter = new MetaMetricsAdapter({
      getAccessToken: dummyGetAccessToken,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics(validRequest);
    expect(res.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    if (!res.success) {
      expect(res.error.category).toBe('INVALID_REQUEST');
      expect(res.error.message).toContain('requires a resolveExternalCampaignId resolver');
    }
  });

  it('REQUIRED: uses resolved external Meta campaign ID in filtering and NEVER internal campaignId', async () => {
    let capturedUrl = '';
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          data: [
            {
              campaign_id: externalMetaCmpId,
              account_id: '123456789',
              date_start: '2026-08-01',
              date_stop: '2026-08-01',
              spend: '100.00',
              impressions: '1000',
              account_currency: 'USD',
            },
          ],
        }),
        { status: 200 },
      );
    });

    const adapter = new MetaMetricsAdapter({
      getAccessToken: dummyGetAccessToken,
      resolveExternalCampaignId: mockResolver,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics(validRequest);
    expect(res.success).toBe(true);

    const parsedUrl = new URL(capturedUrl);
    const filteringParam = parsedUrl.searchParams.get('filtering');
    expect(filteringParam).toBe(
      JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [externalMetaCmpId] }]),
    );

    // Afirmación explícita requerida por la sección 9 del Gate:
    expect(capturedUrl).toContain(externalMetaCmpId);
    expect(capturedUrl).not.toContain('campaign-internal-001');

    if (res.success) {
      expect(res.value.records[0]?.campaignId).toBe(internalCmpId); // Interno de BopAgency
      expect(res.value.records[0]?.externalCampaignId).toBe(externalMetaCmpId); // Externo de Meta
    }
  });

  it('rejects fetch when resolved resource account mismatches requested account BEFORE HTTP call', async () => {
    const mockFetch = vi.fn();
    const adapter = new MetaMetricsAdapter({
      getAccessToken: dummyGetAccessToken,
      resolveExternalCampaignId: async () =>
        ok({
          externalCampaignId: externalMetaCmpId,
          providerAccountId: 'MISMATCHED_ACCOUNT_999', // Mismatched account
        }),
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics(validRequest);
    expect(res.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    if (!res.success) {
      expect(res.error.category).toBe('INVALID_REQUEST');
      expect(res.error.message).toContain('Resource account mismatch');
    }
  });

  it('rejects fetch when requested scope is not campaign (e.g. account or client scope)', async () => {
    const mockFetch = vi.fn();
    const adapter = new MetaMetricsAdapter({
      getAccessToken: dummyGetAccessToken,
      resolveExternalCampaignId: mockResolver,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics({
      ...validRequest,
      scope: 'account',
    });

    expect(res.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    if (!res.success) {
      expect(res.error.category).toBe('INVALID_REQUEST');
      expect(res.error.message).toContain("only supports scope='campaign'");
    }
  });

  it('fails deterministically when ALL returned rows mismatch expected external campaign ID', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              campaign_id: 'UNEXPECTED_CAMPAIGN_999',
              date_start: '2026-08-01',
              date_stop: '2026-08-01',
              spend: '500.00',
              account_currency: 'USD',
            },
          ],
        }),
        { status: 200 },
      );
    });

    const adapter = new MetaMetricsAdapter({
      getAccessToken: dummyGetAccessToken,
      resolveExternalCampaignId: mockResolver,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics(validRequest);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.category).toBe('UNKNOWN');
      expect(res.error.message).toContain('0 rows matched expected external campaign ID');
    }
  });

  it('Phase 9B.5: uses request.externalCampaignId directly and does NOT invoke resolveExternalCampaignId when present', async () => {
    let capturedUrl = '';
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          data: [
            {
              campaign_id: 'explicit-meta-cmp-999',
              account_id: '123456789',
              date_start: '2026-08-01',
              date_stop: '2026-08-01',
              spend: '75.00',
              impressions: '500',
              account_currency: 'USD',
            },
          ],
        }),
        { status: 200 },
      );
    });

    const mockResolverSpy = vi.fn(mockResolver);

    const adapter = new MetaMetricsAdapter({
      getAccessToken: dummyGetAccessToken,
      resolveExternalCampaignId: mockResolverSpy,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics({
      ...validRequest,
      externalCampaignId: 'explicit-meta-cmp-999',
    });

    expect(res.success).toBe(true);
    expect(mockResolverSpy).not.toHaveBeenCalled();
    const parsedUrl = new URL(capturedUrl);
    const filteringParam = parsedUrl.searchParams.get('filtering');
    expect(filteringParam).toBe(
      JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ['explicit-meta-cmp-999'] }]),
    );
    expect(capturedUrl).toContain('explicit-meta-cmp-999');
  });

  it('Phase 9B.5: succeeds when resolveExternalCampaignId is undefined if request.externalCampaignId is provided', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              campaign_id: 'standalone-meta-123',
              date_start: '2026-08-01',
              date_stop: '2026-08-01',
              spend: '10.00',
              account_currency: 'USD',
            },
          ],
        }),
        { status: 200 },
      );
    });

    const adapter = new MetaMetricsAdapter({
      getAccessToken: dummyGetAccessToken,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics({
      ...validRequest,
      externalCampaignId: 'standalone-meta-123',
    });

    expect(res.success).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });
});
