import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleOAuthClient } from '../google-oauth.client';

describe('GoogleOAuthClient', () => {
  const clientId = 'test-client-id';
  const clientSecret = 'test-client-secret';
  let client: GoogleOAuthClient;

  beforeEach(() => {
    client = new GoogleOAuthClient(clientId, clientSecret);
    vi.restoreAllMocks();
  });

  it('exchanges code for tokens via POST request to Google OAuth endpoint', async () => {
    const mockResponse = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/adwords',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response);

    const result = await client.exchangeCodeForTokens('valid-code', 'https://example.com/callback');

    expect(result.accessToken).toBe('mock-access-token');
    expect(result.refreshToken).toBe('mock-refresh-token');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
