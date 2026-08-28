import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GoogleAdsApiClient,
  GoogleAdsApiError,
  requireGoogleAdsApiVersion,
  requireGoogleAdsDeveloperToken,
} from '../google-ads-api.client';
import type { LoggerPort } from '@bop-agency/application';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('GoogleAdsApiClient Unit Tests & Safety Matrix (Phase 8F.2)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      GOOGLE_ADS_API_VERSION: 'v25',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'test-dev-token',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    };
  });

  it('validates mandatory GOOGLE_ADS_API_VERSION format v{number} with zero default fallback', () => {
    delete process.env['GOOGLE_ADS_API_VERSION'];
    expect(() => requireGoogleAdsApiVersion()).toThrow(/GOOGLE_ADS_API_VERSION/);

    process.env['GOOGLE_ADS_API_VERSION'] = 'invalid-version';
    expect(() => requireGoogleAdsApiVersion()).toThrow(/GOOGLE_ADS_API_VERSION/);

    process.env['GOOGLE_ADS_API_VERSION'] = 'v25';
    expect(requireGoogleAdsApiVersion()).toBe('v25');
  });

  it('validates mandatory GOOGLE_ADS_DEVELOPER_TOKEN', () => {
    delete process.env['GOOGLE_ADS_DEVELOPER_TOKEN'];
    expect(() => requireGoogleAdsDeveloperToken()).toThrow(/GOOGLE_ADS_DEVELOPER_TOKEN/);

    process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] = 'my-token';
    expect(requireGoogleAdsDeveloperToken()).toBe('my-token');
  });

  it('requires clientId and clientSecret for OAuth refresh', async () => {
    delete process.env['GOOGLE_CLIENT_ID'];
    delete process.env['GOOGLE_CLIENT_SECRET'];

    const client = new GoogleAdsApiClient({ developerToken: 'dev-123' }, makeLogger());
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error_description: 'invalid_client' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(client.refreshAccessToken('refresh-123')).rejects.toThrow(GoogleAdsApiError);
  });

  it('refreshes access token via Google OAuth token endpoint without logging refresh token', async () => {
    const logger = makeLogger();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'secret-access-token-999',
        expires_in: 3600,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GoogleAdsApiClient({ developerToken: 'dev-123' }, logger);
    const result = await client.refreshAccessToken('super-secret-refresh-token');

    expect(result.accessToken).toBe('secret-access-token-999');
    expect(result.expiresIn).toBe(3600);

    const callBody = mockFetch.mock.calls[0]?.[1]?.body as string;
    expect(callBody).toContain('refresh_token=super-secret-refresh-token');

    // Verify logger never received the refresh token or access token
    const logCallsStr = JSON.stringify(logger);
    expect(logCallsStr).not.toContain('super-secret-refresh-token');
    expect(logCallsStr).not.toContain('secret-access-token-999');
  });

  it('executes REST mutate POST call using operating customerId in URL and managed login-customer-id header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === 'request-id' ? 'req-xyz-777' : null) },
      json: vi.fn().mockResolvedValue({
        mutateOperationResponses: [
          { campaignResult: { resourceName: 'customers/1234567890/campaigns/9876543210' } },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GoogleAdsApiClient({ developerToken: 'dev-123' }, makeLogger());
    const result = await client.mutate({
      customerId: '1234567890',
      managerCustomerId: '1111111111',
      accessToken: 'access-123',
      payload: {
        mutateOperations: [{ campaignOperation: {} }],
        partialFailure: false,
        validateOnly: false,
        responseContentType: 'RESOURCE_NAME_ONLY',
      },
    });

    expect(result.requestId).toBe('req-xyz-777');
    expect(result.response.mutateOperationResponses?.[0]?.campaignResult?.resourceName).toBe(
      'customers/1234567890/campaigns/9876543210',
    );

    // URL MUST use operating customerId (1234567890), NOT managerCustomerId (1111111111)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:mutate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer access-123',
          'developer-token': 'dev-123',
          'login-customer-id': '1111111111',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('omits login-customer-id header when managerCustomerId is null (direct account)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: vi.fn().mockResolvedValue({ mutateOperationResponses: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GoogleAdsApiClient({ developerToken: 'dev-123' }, makeLogger());
    await client.mutate({
      customerId: '1234567890',
      managerCustomerId: null,
      accessToken: 'access-123',
      payload: {
        mutateOperations: [],
        partialFailure: false,
        validateOnly: false,
        responseContentType: 'RESOURCE_NAME_ONLY',
      },
    });

    const headersUsed = mockFetch.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headersUsed['login-customer-id']).toBeUndefined();
  });

  it('throws GoogleAdsApiError on HTTP 400 provider rejection', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => 'req-400-err' },
      json: vi.fn().mockResolvedValue({ message: 'Invalid field value' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GoogleAdsApiClient({ developerToken: 'dev-123' }, makeLogger());
    await expect(
      client.mutate({
        customerId: '1234567890',
        managerCustomerId: null,
        accessToken: 'access-123',
        payload: { mutateOperations: [], partialFailure: false, validateOnly: false, responseContentType: 'RESOURCE_NAME_ONLY' },
      }),
    ).rejects.toThrow(GoogleAdsApiError);
  });

  it('throws GoogleAdsApiError on HTTP 401 / 403 / 429 status codes', async () => {
    for (const status of [401, 403, 429]) {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        headers: { get: () => 'req-err' },
        json: vi.fn().mockResolvedValue({ message: `Error ${status}` }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new GoogleAdsApiClient({ developerToken: 'dev-123' }, makeLogger());
      try {
        await client.mutate({
          customerId: '1234567890',
          managerCustomerId: null,
          accessToken: 'access-123',
          payload: { mutateOperations: [], partialFailure: false, validateOnly: false, responseContentType: 'RESOURCE_NAME_ONLY' },
        });
        expect.unreachable('Should have thrown GoogleAdsApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(GoogleAdsApiError);
        expect((err as GoogleAdsApiError).statusCode).toBe(status);
      }
    }
  });

  it('throws GoogleAdsApiError on 5xx post-submission response without auto-retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => 'req-503-err' },
      json: vi.fn().mockResolvedValue({ message: 'Service Unavailable' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GoogleAdsApiClient({ developerToken: 'dev-123' }, makeLogger());
    await expect(
      client.mutate({
        customerId: '1234567890',
        managerCustomerId: null,
        accessToken: 'access-123',
        payload: { mutateOperations: [], partialFailure: false, validateOnly: false, responseContentType: 'RESOURCE_NAME_ONLY' },
      }),
    ).rejects.toThrow(GoogleAdsApiError);

    // Verify fetch was called EXACTLY ONCE (zero retries)
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('escapes single quotes and backslashes in searchCampaignByExactName GAQL query', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-search-escape' },
      json: vi.fn().mockResolvedValue({ results: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GoogleAdsApiClient({ developerToken: 'dev-123' }, makeLogger());
    await client.searchCampaignByExactName({
      customerId: '1234567890',
      managerCustomerId: '1111111111',
      accessToken: 'access-123',
      exactCorrelationName: "BOP-job's\\name",
    });

    const callBodyStr = mockFetch.mock.calls[0]?.[1]?.body as string;
    const bodyObj = JSON.parse(callBodyStr);
    expect(bodyObj.query).toContain("WHERE campaign.name = 'BOP-job\\'s\\\\name'");
  });

  it('handles multi-page GAQL search using nextPageToken and stops early if >=2 exact matches found', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'req-p1' },
        json: vi.fn().mockResolvedValue({
          results: [{ campaign: { id: '1', name: 'TARGET_CAMPAIGN' } }],
          nextPageToken: 'token-page-2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'req-p2' },
        json: vi.fn().mockResolvedValue({
          results: [{ campaign: { id: '2', name: 'TARGET_CAMPAIGN' } }],
          nextPageToken: 'token-page-3',
        }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GoogleAdsApiClient({ developerToken: 'dev-123' }, makeLogger());
    const res = await client.searchCampaignByExactName({
      customerId: '1234567890',
      managerCustomerId: null,
      accessToken: 'access-123',
      exactCorrelationName: 'TARGET_CAMPAIGN',
    });

    expect(res.results.length).toBe(2);
    // Should stop fetching after page 2 because 2 exact matches were observed
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
