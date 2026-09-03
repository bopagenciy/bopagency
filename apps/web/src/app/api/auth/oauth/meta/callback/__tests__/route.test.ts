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

describe('Meta OAuth Callback Route (Phase 9B.6B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to error when missing code or state', async () => {
    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/callback');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/protected/clients?error=missing_oauth_parameters');
  });

  it('redirects to login when user is unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('Unauthorized') });

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/callback?code=abc&state=xyz');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/login?error=unauthenticated');
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
});
