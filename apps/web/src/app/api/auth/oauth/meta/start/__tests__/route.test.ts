import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

const mockConnectMetaIntegration = vi.fn();
vi.mock('@bop-agency/application', () => ({
  connectMetaIntegration: (...args: unknown[]) => mockConnectMetaIntegration(...args),
}));

const mockGetMetaAppConfig = vi.fn();
const mockGetMetaGraphApiVersion = vi.fn();
const mockGetMetaLoginConfigId = vi.fn();

vi.mock('@bop-agency/infrastructure', () => ({
  getMetaAppConfig: () => mockGetMetaAppConfig(),
  getMetaGraphApiVersion: () => mockGetMetaGraphApiVersion(),
  getMetaLoginConfigId: () => mockGetMetaLoginConfigId(),
}));

describe('Meta OAuth Start Route (Phase 9B.6D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMetaAppConfig.mockReturnValue({ appId: 'app-123', appSecret: 'sec-456' });
    mockGetMetaGraphApiVersion.mockReturnValue('v26.0');
    mockGetMetaLoginConfigId.mockReturnValue(undefined);
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('Unauthorized') });

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/start?organizationId=org-1&clientId=cli-1');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns 400 when organizationId or clientId is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/start?organizationId=org-1');
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it('propagates configId when getMetaLoginConfigId returns a value', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockGetMetaLoginConfigId.mockReturnValue('cfg-biz-999');
    mockConnectMetaIntegration.mockResolvedValue({
      success: true,
      value: {
        oauthUrl: 'https://www.facebook.com/v26.0/dialog/oauth?client_id=app-123&config_id=cfg-biz-999',
        stateNonce: 'nonce-123',
        expiresAt: '2026-09-03T18:00:00Z',
      },
    });

    const req = new Request('https://bop-agency.vercel.app/api/auth/oauth/meta/start?organizationId=org-1&clientId=cli-1');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.oauthUrl).toContain('config_id=cfg-biz-999');

    expect(mockConnectMetaIntegration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: 'org-1',
        clientId: 'cli-1',
        actorUserId: 'user-1',
        appId: 'app-123',
        apiVersion: 'v26.0',
        configId: 'cfg-biz-999',
      }),
    );
  });
});
