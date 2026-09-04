import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockCreatePendingSession = vi.fn();
const mockExchangeCode = vi.fn();
const mockExchangeUserTokenForLongLived = vi.fn();
const mockDiscoverPages = vi.fn();
const mockDiscoverAdAccounts = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    rpc: mockRpc,
  })),
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock('@bop-agency/infrastructure', () => ({
  MetaGraphApiClient: vi.fn().mockImplementation(() => ({
    exchangeCodeForUserToken: mockExchangeCode,
    exchangeUserTokenForLongLived: mockExchangeUserTokenForLongLived,
    discoverPagesAndAccounts: mockDiscoverPages,
    discoverAdAccounts: mockDiscoverAdAccounts,
  })),
  SupabasePendingConnectionRepository: vi.fn().mockImplementation(() => ({
    createPendingSession: mockCreatePendingSession,
  })),
}));

describe('Meta OAuth Callback Route (Phase 9B.6G Hardened)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to error under /clients (not legacy /protected/clients) when missing code or state', async () => {
    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/callback');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toBe('https://bop-agency.vercel.app/clients?error=missing_oauth_parameters');
    expect(location).not.toContain('/protected/clients');
  });

  it('redirects to /clients with error when errorParam is returned by Meta', async () => {
    const req = new Request(
      'https://bop-agency.vercel.app/api/auth/oauth/meta/callback?error=access_denied&error_description=User%20denied%20access',
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/clients?error=User%20denied%20access');
    expect(location).not.toContain('/protected/clients');
  });

  it('redirects to login when user is unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('Unauthorized') });

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/callback?code=abc&state=xyz');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/login?error=unauthenticated');
  });

  it('redirects to /clients/{clientId}?error=... when state is invalid/expired and client_id is recovered', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockRpc.mockResolvedValue({
      data: {
        success: false,
        message: 'OAuth state expired',
        client_id: 'cli-def',
      },
      error: null,
    });

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/callback?code=abc&state=xyz');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toBe('https://bop-agency.vercel.app/clients/cli-def?error=OAuth%20state%20expired');
    expect(location).not.toContain('/protected/clients');
  });

  it('discovers ad accounts and pages, creates pending session, and redirects to meta selection page with 0 tokens exposed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        organization_id: 'org-abc',
        client_id: 'cli-def',
      },
      error: null,
    });

    mockExchangeCode.mockResolvedValue('short-token-123');
    mockExchangeUserTokenForLongLived.mockResolvedValue('long-user-token-456');
    mockDiscoverPages.mockResolvedValue([
      { page_id: 'page-1', page_name: 'Page 1', page_access_token: 'page-token' },
    ]);
    mockDiscoverAdAccounts.mockResolvedValue([
      { id: 'act_102030', canonicalAdAccountId: '102030', name: 'Ads 1', account_status: 1 },
    ]);

    mockCreatePendingSession.mockResolvedValue({
      pendingConnectionId: 'pending-uuid-789',
      expiresAt: '2026-09-03T18:00:00.000Z',
    });

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/callback?code=valid-code&state=valid-state');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';

    // Verify redirect target
    expect(location).toBe('https://bop-agency.vercel.app/clients/cli-def/integrations/meta/select?pendingId=pending-uuid-789');

    // Security audit: ensure no sensitive data in URL
    expect(location).not.toContain('token');
    expect(location).not.toContain('short-token-123');
    expect(location).not.toContain('long-user-token-456');
    expect(location).not.toContain('valid-code');
    expect(location).not.toContain('valid-state');

    // Verify createPendingSession arguments
    expect(mockCreatePendingSession).toHaveBeenCalledWith({
      organizationId: 'org-abc',
      clientId: 'cli-def',
      userId: 'user-123',
      pages: [{ page_id: 'page-1', page_name: 'Page 1', page_access_token: 'page-token' }],
      adAccounts: [{ id: 'act_102030', canonicalAdAccountId: '102030', name: 'Ads 1', account_status: 1 }],
      userAccessToken: 'long-user-token-456',
      ttlMinutes: 10,
    });
  });

  it('creates pending session when Page discovery fails but Ad Account discovery succeeds', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        organization_id: 'org-abc',
        client_id: 'cli-def',
      },
      error: null,
    });

    mockExchangeCode.mockResolvedValue('short-token');
    mockExchangeUserTokenForLongLived.mockResolvedValue('long-token');
    mockDiscoverPages.mockRejectedValue(new Error('Page discovery failed with 403'));
    mockDiscoverAdAccounts.mockResolvedValue([
      { id: 'act_111', canonicalAdAccountId: '111', name: 'Legalink Ads', account_status: 1 },
    ]);

    mockCreatePendingSession.mockResolvedValue({
      pendingConnectionId: 'pending-ads-only',
      expiresAt: '2026-09-03T18:00:00.000Z',
    });

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/callback?code=valid-code&state=valid-state');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toBe('https://bop-agency.vercel.app/clients/cli-def/integrations/meta/select?pendingId=pending-ads-only');

    expect(mockCreatePendingSession).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: [],
        adAccounts: [{ id: 'act_111', canonicalAdAccountId: '111', name: 'Legalink Ads', account_status: 1 }],
      }),
    );
  });

  it('creates pending session when Ad Account discovery fails but Page discovery succeeds', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        organization_id: 'org-abc',
        client_id: 'cli-def',
      },
      error: null,
    });

    mockExchangeCode.mockResolvedValue('short-token');
    mockExchangeUserTokenForLongLived.mockResolvedValue('long-token');
    mockDiscoverPages.mockResolvedValue([
      { page_id: 'page-legalink', page_name: 'Legalink FB', page_access_token: 'page-token' },
    ]);
    mockDiscoverAdAccounts.mockRejectedValue(new Error('Ad accounts query failed'));

    mockCreatePendingSession.mockResolvedValue({
      pendingConnectionId: 'pending-pages-only',
      expiresAt: '2026-09-03T18:00:00.000Z',
    });

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/callback?code=valid-code&state=valid-state');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toBe('https://bop-agency.vercel.app/clients/cli-def/integrations/meta/select?pendingId=pending-pages-only');

    expect(mockCreatePendingSession).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: [{ page_id: 'page-legalink', page_name: 'Legalink FB', page_access_token: 'page-token' }],
        adAccounts: [],
      }),
    );
  });

  it('redirects to client detail with safe error when both discovery families fail', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        organization_id: 'org-abc',
        client_id: 'cli-def',
      },
      error: null,
    });

    mockExchangeCode.mockResolvedValue('short-token');
    mockExchangeUserTokenForLongLived.mockResolvedValue('long-token');
    mockDiscoverPages.mockRejectedValue(new Error('Pages error'));
    mockDiscoverAdAccounts.mockRejectedValue(new Error('Ads error'));

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/callback?code=valid-code&state=valid-state');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/clients/cli-def?error=Failed%20to%20discover%20Facebook%20Pages%20and%20Meta%20Ad%20Accounts');
  });
});
