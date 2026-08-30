import { describe, it, expect, vi } from 'vitest';
import { ok } from '@bop-agency/shared';
import type { OrganizationId, ClientId, CampaignId } from '@bop-agency/domain';
import type { MetricsProviderFetchRequest } from '@bop-agency/application';
import { GoogleMetricsAdapter } from '../google-metrics.adapter';
import { convertCostMicrosToMonetaryString } from '../google-metrics-error.mapper';

describe('GoogleMetricsAdapter Hardening Gate (Phase 9B.2)', () => {
  const orgId = 'org-100' as OrganizationId;
  const cliId = 'cli-200' as ClientId;
  const internalCmpId = 'campaign-internal-001' as CampaignId;
  const externalGoogleCmpId = '9876543210';

  const validRequest: MetricsProviderFetchRequest = {
    organizationId: orgId,
    clientId: cliId,
    campaignId: internalCmpId,
    platform: 'google',
    providerAccountId: '123-456-7890', // Normalizado a '1234567890'
    startDate: '2026-08-01',
    endDate: '2026-08-30',
    scope: 'campaign',
  };

  const dummyGetCredentials = async () =>
    ok({
      accessToken: 'GOOGLE_ACCESS_SECRET_123',
      developerToken: 'GOOGLE_DEVELOPER_SECRET_456',
      managerCustomerId: '999-888-7777',
    });

  const mockResolver = async () =>
    ok({
      externalCampaignId: externalGoogleCmpId,
      providerAccountId: '1234567890',
      organizationId: orgId,
      clientId: cliId,
    });

  it('verifies cost_micros rounding boundary tests (micros -> money policy)', () => {
    expect(convertCostMicrosToMonetaryString(1)).toBe('0.00'); // 1 micro -> $0.00
    expect(convertCostMicrosToMonetaryString(4999)).toBe('0.00'); // 4999 micros -> $0.00
    expect(convertCostMicrosToMonetaryString(5000)).toBe('0.01'); // 5000 micros -> $0.01
    expect(convertCostMicrosToMonetaryString(9999)).toBe('0.01'); // 9999 micros -> $0.01
    expect(convertCostMicrosToMonetaryString(10000)).toBe('0.01'); // 10000 micros -> $0.01
    expect(convertCostMicrosToMonetaryString(1004999)).toBe('1.00'); // 1004999 micros -> $1.00
    expect(convertCostMicrosToMonetaryString(1005000)).toBe('1.01'); // 1005000 micros -> $1.01
    expect(convertCostMicrosToMonetaryString(1005001)).toBe('1.01'); // 1005001 micros -> $1.01
    expect(convertCostMicrosToMonetaryString(1000000)).toBe('1.00'); // 1000000 micros -> $1.00
    expect(convertCostMicrosToMonetaryString(1234567)).toBe('1.23'); // 1234567 micros -> $1.23
  });

  it('proves cost_micros > Number.MAX_SAFE_INTEGER does not lose precision via BigInt string parsing', () => {
    const hugeMicros = '9007199254740991000'; // 9,007,199,254,740.991 USD
    expect(convertCostMicrosToMonetaryString(hugeMicros)).toBe('9007199254740.99');
  });

  it('preserves fractional Google conversions (DOUBLE metrics e.g. 2.5, 0.33) without lossy integer floor/round', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          results: [
            {
              campaign: { id: externalGoogleCmpId },
              customer: { currencyCode: 'USD' },
              segments: { date: '2026-08-01' },
              metrics: {
                impressions: '1000',
                clicks: '50',
                cost_micros: '1250000',
                conversions: '2.5', // Conversión fraccional atribuida por Google
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const adapter = new GoogleMetricsAdapter({
      getCredentials: dummyGetCredentials,
      resolveExternalCampaignId: mockResolver,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics(validRequest);
    expect(res.success).toBe(true);
    if (res.success) {
      const rec = res.value.records[0];
      expect(rec?.conversions).toBe(2.5); // Preservado como 2.5 exactamente
    }
  });

  it('verifies page 2 pagination uses pageToken while retaining identical GAQL query', async () => {
    const capturedBodies: Record<string, unknown>[] = [];
    const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body || '{}')));
      return new Response(
        JSON.stringify({
          results: [
            {
              campaign: { id: externalGoogleCmpId },
              customer: { currencyCode: 'USD' },
              segments: { date: '2026-08-01' },
              metrics: { impressions: '100', clicks: '10', cost_micros: '500000', conversions: '1' },
            },
          ],
          nextPageToken: 'page_2_token_abc',
        }),
        { status: 200 },
      );
    });

    const adapter = new GoogleMetricsAdapter({
      getCredentials: dummyGetCredentials,
      resolveExternalCampaignId: mockResolver,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    // Página 1
    const res1 = await adapter.fetchMetrics(validRequest);
    expect(res1.success).toBe(true);
    if (res1.success) {
      expect(res1.value.nextCursor).toBe('page_2_token_abc');
      expect(res1.value.hasMore).toBe(true);
    }

    // Página 2
    const res2 = await adapter.fetchMetrics({
      ...validRequest,
      pageCursor: 'page_2_token_abc',
    });
    expect(res2.success).toBe(true);

    expect(capturedBodies.length).toBe(2);
    expect(capturedBodies[0]?.['query']).toBe(capturedBodies[1]?.['query']); // GAQL idéntico en ambas páginas
    expect(capturedBodies[1]?.['pageToken']).toBe('page_2_token_abc');
  });

  it('redacts distinctive secrets GOOGLE_ACCESS_SECRET_123 and GOOGLE_DEVELOPER_SECRET_456 from error messages', async () => {
    const accessSecret = 'GOOGLE_ACCESS_SECRET_123';
    const devSecret = 'GOOGLE_DEVELOPER_SECRET_456';

    const mockFetch = vi.fn(async () => {
      throw new Error(`Connection rejected with Bearer ${accessSecret} and developer-token ${devSecret}`);
    });

    const adapter = new GoogleMetricsAdapter({
      getCredentials: async () =>
        ok({
          accessToken: accessSecret,
          developerToken: devSecret,
        }),
      resolveExternalCampaignId: mockResolver,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics(validRequest);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.message).not.toContain(accessSecret);
      expect(res.error.message).not.toContain(devSecret);
      expect(res.error.message).toContain('Bearer REDACTED');
      expect(res.error.message).toContain('developer-token=REDACTED');
    }
  });

  it('rejects malformed external campaign IDs to prevent GAQL injection', async () => {
    const mockFetch = vi.fn();
    const adapter = new GoogleMetricsAdapter({
      getCredentials: dummyGetCredentials,
      resolveExternalCampaignId: async () =>
        ok({
          externalCampaignId: "12345' OR 1=1 --", // Malformed injection string
          providerAccountId: '1234567890',
          organizationId: orgId,
          clientId: cliId,
        }),
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await adapter.fetchMetrics(validRequest);
    expect(res.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    if (!res.success) {
      expect(res.error.category).toBe('INVALID_REQUEST');
      expect(res.error.message).toContain('Malformed external campaign ID resolved');
    }
  });
});
