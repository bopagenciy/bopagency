import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaGraphApiClient } from '../meta-graph-api.client';

describe('MetaGraphApiClient Direct Unit Tests (Phase 8G.2 Hardened)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      META_GRAPH_API_VERSION: 'v21.0',
      META_APP_ID: 'app-id-test',
      META_APP_SECRET: 'app-secret-test',
    };
  });

  it('fails configuration validation when META_GRAPH_API_VERSION is missing (NO default/fallback)', () => {
    delete process.env['META_GRAPH_API_VERSION'];
    expect(() => new MetaGraphApiClient()).toThrow(/META_GRAPH_API_VERSION is missing/);
  });

  it('queries Facebook post with exact path, allowed fields, and Graph API version', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'x-fb-trace-id': 'fb-trace-123' }),
      json: vi.fn().mockResolvedValue({
        id: '12345_67890',
        created_time: '2026-08-28T12:00:00+0000',
        permalink_url: 'https://facebook.com/12345/posts/67890',
        is_published: true,
      }),
    });

    const client = new MetaGraphApiClient(mockFetch);
    const obs = await client.observeFacebookPost('12345_67890', 'secret-page-token-123');

    expect(obs.result).toEqual({
      id: '12345_67890',
      created_time: '2026-08-28T12:00:00+0000',
      permalink_url: 'https://facebook.com/12345/posts/67890',
      is_published: true,
    });
    expect(obs.requestId).toBe('fb-trace-123');

    // Token leakage security audit: token must not be in returned result object
    expect(JSON.stringify(obs)).not.toContain('secret-page-token-123');

    const firstCall = mockFetch.mock.calls[0];
    const calledUrl = new URL((firstCall?.[0] ?? '') as string);
    expect(calledUrl.pathname).toBe('/v21.0/12345_67890');
    expect(calledUrl.searchParams.get('fields')).toBe('id,created_time,permalink_url,is_published');
    expect(calledUrl.searchParams.get('access_token')).toBe('secret-page-token-123');
  });

  it('queries Instagram media with exact path, allowed fields, and Graph API version', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'x-fb-trace-id': 'ig-trace-456' }),
      json: vi.fn().mockResolvedValue({
        id: '17841400000000000',
        media_type: 'IMAGE',
        media_product_type: 'FEED',
        permalink: 'https://instagram.com/p/Cxyz123/',
        timestamp: '2026-08-28T12:00:00+0000',
      }),
    });

    const client = new MetaGraphApiClient(mockFetch);
    const obs = await client.observeInstagramMedia('17841400000000000', 'secret-page-token-123');

    expect(obs.result).toEqual({
      id: '17841400000000000',
      media_type: 'IMAGE',
      media_product_type: 'FEED',
      permalink: 'https://instagram.com/p/Cxyz123/',
      timestamp: '2026-08-28T12:00:00+0000',
    });
    expect(obs.requestId).toBe('ig-trace-456');

    // Token leakage security audit
    expect(JSON.stringify(obs)).not.toContain('secret-page-token-123');

    const secondCall = mockFetch.mock.calls[0];
    const calledUrl = new URL((secondCall?.[0] ?? '') as string);
    expect(calledUrl.pathname).toBe('/v21.0/17841400000000000');
    expect(calledUrl.searchParams.get('fields')).toBe('id,media_type,media_product_type,permalink,timestamp');
  });

  it('parses definitive missing object error (subcode 33) and does not leak token in error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'x-fb-trace-id': 'err-trace-789' }),
      json: vi.fn().mockResolvedValue({
        error: {
          message: 'Unsupported get request. Object with ID does not exist',
          type: 'OAuthException',
          code: 100,
          error_subcode: 33,
        },
      }),
    });

    const client = new MetaGraphApiClient(mockFetch);
    const obs = await client.observeFacebookPost('12345_del', 'secret-page-token-123');

    expect(obs.result).toBeNull();
    expect(obs.httpStatus).toBe(400);
    expect(obs.errorCode).toBe(100);
    expect(obs.errorSubcode).toBe(33);
    expect(obs.requestId).toBe('err-trace-789');

    // Token leakage security audit
    expect(JSON.stringify(obs)).not.toContain('secret-page-token-123');
  });

  it('parses HTTP 429 rate limit errors safely', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'x-fb-trace-id': 'rate-limit-trace' }),
      json: vi.fn().mockResolvedValue({
        error: {
          message: 'Application request limit reached',
          code: 4,
        },
      }),
    });

    const client = new MetaGraphApiClient(mockFetch);
    const obs = await client.observeFacebookPost('12345_67890', 'token-abc');

    expect(obs.result).toBeNull();
    expect(obs.httpStatus).toBe(429);
    expect(obs.errorCode).toBe(4);
  });

  it('parses HTTP 500 / 503 server errors safely', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ 'x-fb-trace-id': '503-trace' }),
      json: vi.fn().mockResolvedValue({
        error: {
          message: 'Service Temporarily Unavailable',
          code: 2,
        },
      }),
    });

    const client = new MetaGraphApiClient(mockFetch);
    const obs = await client.observeInstagramMedia('17841400000000000', 'token-abc');

    expect(obs.result).toBeNull();
    expect(obs.httpStatus).toBe(503);
    expect(obs.errorCode).toBe(2);
  });

  describe('discoverAdAccounts (Phase 9B.6B)', () => {
    it('discovers a single ad account and strips act_ prefix for canonicalAdAccountId', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'act_1020304050',
              account_id: '1020304050',
              name: 'Acme Ads Production',
              account_status: 1,
              currency: 'USD',
              timezone_name: 'America/New_York',
            },
          ],
        }),
      });

      const client = new MetaGraphApiClient(mockFetch);
      const accounts = await client.discoverAdAccounts('user-long-token-999');

      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toEqual({
        id: 'act_1020304050',
        canonicalAdAccountId: '1020304050',
        name: 'Acme Ads Production',
        account_status: 1,
        currency: 'USD',
        timezone_name: 'America/New_York',
      });

      const callUrl = new URL(String(mockFetch.mock.calls[0]?.[0] ?? ''));
      expect(callUrl.pathname).toBe('/v21.0/me/adaccounts');
      expect(callUrl.searchParams.get('fields')).toBe('id,name,account_id,account_status,currency,timezone_name');
      expect(callUrl.searchParams.get('access_token')).toBe('user-long-token-999');
    });

    it('discovers multiple accounts and handles raw IDs without act_ prefix', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: '111222333', account_id: '111222333', name: 'Account 1', account_status: 1, currency: 'EUR', timezone_name: 'Europe/Madrid' },
            { id: 'act_444555666', account_id: '444555666', name: 'Account 2', account_status: 2, currency: 'USD', timezone_name: 'America/Bogota' },
          ],
        }),
      });

      const client = new MetaGraphApiClient(mockFetch);
      const accounts = await client.discoverAdAccounts('user-token');

      expect(accounts).toHaveLength(2);
      const acc0 = accounts[0];
      const acc1 = accounts[1];
      expect(acc0).toBeDefined();
      expect(acc1).toBeDefined();
      if (acc0 && acc1) {
        expect(acc0.canonicalAdAccountId).toBe('111222333');
        expect(acc0.id).toBe('act_111222333');
        expect(acc0.account_status).toBe(1);

        expect(acc1.canonicalAdAccountId).toBe('444555666');
        expect(acc1.id).toBe('act_444555666');
        expect(acc1.account_status).toBe(2);
      }
    });

    it('handles empty response gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      const client = new MetaGraphApiClient(mockFetch);
      const accounts = await client.discoverAdAccounts('user-token');
      expect(accounts).toEqual([]);
    });

    it('throws descriptive error on Meta API failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({
          error: { message: 'Session has expired', code: 190 },
        }),
      });

      const client = new MetaGraphApiClient(mockFetch);
      await expect(client.discoverAdAccounts('expired-token')).rejects.toThrow(
        /Meta ad accounts discovery failed: Session has expired/,
      );
    });

    it('throws error when response data is malformed', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ not_data: {} }),
      });

      const client = new MetaGraphApiClient(mockFetch);
      await expect(client.discoverAdAccounts('user-token')).rejects.toThrow(
        /Meta ad accounts discovery failed/,
      );
    });

    it('falls back to /{id}/assigned_ad_accounts when /me/adaccounts is empty', async () => {
      const mockFetch = vi.fn()
        // 1. /me/adaccounts returns empty data
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ data: [] }),
        })
        // 2. /me?fields=id returns system user id
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ id: 'sys-user-888' }),
        })
        // 3. /sys-user-888/assigned_ad_accounts returns assigned accounts
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'act_998877',
                account_id: '998877',
                name: 'Business Assigned Account',
                account_status: 1,
                currency: 'COP',
                timezone_name: 'America/Bogota',
              },
            ],
          }),
        });

      const client = new MetaGraphApiClient(mockFetch);
      const accounts = await client.discoverAdAccounts('system-token-xyz');

      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toEqual({
        id: 'act_998877',
        canonicalAdAccountId: '998877',
        name: 'Business Assigned Account',
        account_status: 1,
        currency: 'COP',
        timezone_name: 'America/Bogota',
      });

      // Verify the fallback URL
      const thirdCall = mockFetch.mock.calls[2];
      const assignedUrl = new URL(String(thirdCall?.[0] ?? ''));
      expect(assignedUrl.pathname).toBe('/v21.0/sys-user-888/assigned_ad_accounts');
    });

    it('falls back to /{id}/assigned_ad_accounts when /me/adaccounts returns an error', async () => {
      const mockFetch = vi.fn()
        // 1. /me/adaccounts returns 400 error
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: vi.fn().mockResolvedValue({
            error: { message: 'Cannot call /me/adaccounts for system user', code: 100 },
          }),
        })
        // 2. /me?fields=id returns system user id
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ id: 'sys-user-999' }),
        })
        // 3. /sys-user-999/assigned_ad_accounts returns assigned accounts
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'act_554433',
                account_id: '554433',
                name: 'Legalink Ads',
                account_status: 1,
                currency: 'USD',
                timezone_name: 'America/Bogota',
              },
            ],
          }),
        });

      const client = new MetaGraphApiClient(mockFetch);
      const accounts = await client.discoverAdAccounts('system-token-xyz');

      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.canonicalAdAccountId).toBe('554433');
    });
  });

  describe('discoverPagesAndAccounts (Phase 9B.6G Resilience)', () => {
    it('discovers pages using only basic fields without requesting instagram on /me/accounts', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'page-101',
                name: 'Legalink Colombia Page',
                access_token: 'page-access-token-101',
              },
            ],
          }),
        })
        // Optional Instagram enrichment for page-101
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            instagram_business_account: {
              id: 'ig-202',
              username: 'legalinkcol',
            },
          }),
        });

      const client = new MetaGraphApiClient(mockFetch);
      const pages = await client.discoverPagesAndAccounts('user-long-token');

      expect(pages).toHaveLength(1);
      expect(pages[0]).toEqual({
        page_id: 'page-101',
        page_name: 'Legalink Colombia Page',
        page_access_token: 'page-access-token-101',
        instagram_account_id: 'ig-202',
        instagram_username: 'legalinkcol',
      });

      // Confirm /me/accounts only requested id,name,access_token
      const firstCallUrl = new URL(String(mockFetch.mock.calls[0]?.[0] ?? ''));
      expect(firstCallUrl.pathname).toBe('/v21.0/me/accounts');
      expect(firstCallUrl.searchParams.get('fields')).toBe('id,name,access_token');
    });

    it('preserves Facebook page when Instagram enrichment fails (e.g. missing instagram_basic permission)', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'page-303',
                name: 'BopAgency Page',
                access_token: 'page-access-token-303',
              },
            ],
          }),
        })
        // Instagram enrichment returns 400 permissions error
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: vi.fn().mockResolvedValue({
            error: {
              message: 'Permissions error: instagram_basic is missing',
              code: 200,
            },
          }),
        });

      const client = new MetaGraphApiClient(mockFetch);
      const pages = await client.discoverPagesAndAccounts('user-long-token');

      // Page is preserved with null Instagram data
      expect(pages).toHaveLength(1);
      expect(pages[0]).toEqual({
        page_id: 'page-303',
        page_name: 'BopAgency Page',
        page_access_token: 'page-access-token-303',
        instagram_account_id: null,
        instagram_username: null,
      });
    });
  });
});
