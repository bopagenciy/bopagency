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

    const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
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

    const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
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
});
