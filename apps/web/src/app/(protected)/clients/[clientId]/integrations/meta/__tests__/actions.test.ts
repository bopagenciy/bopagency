import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPendingMetaResourcesAction,
  finalizeMetaIntegrationAction,
  disconnectMetaIntegrationAction,
} from '../actions';

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
    rpc: vi.fn(),
  })),
}));

const mockGetPendingMetaResources = vi.fn();
const mockFinalizeMetaConnection = vi.fn();
const mockDisconnectMetaIntegration = vi.fn();

vi.mock('@bop-agency/application', () => ({
  getPendingMetaResources: (...args: unknown[]) => mockGetPendingMetaResources(...args),
  finalizeMetaConnection: (...args: unknown[]) => mockFinalizeMetaConnection(...args),
  disconnectMetaIntegration: (...args: unknown[]) => mockDisconnectMetaIntegration(...args),
}));

describe('Meta Integration Server Actions (Phase 9B.6B)', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const clientId = '22222222-2222-2222-2222-222222222222';
  const pendingId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPendingMetaResourcesAction', () => {
    it('returns unauthorized when session is missing', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await getPendingMetaResourcesAction(pendingId, orgId, clientId);
      expect(res).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns resources when authorized', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'owner' } }),
            }),
          }),
        }),
      });

      mockGetPendingMetaResources.mockResolvedValue({
        success: true,
        value: [
          {
            id: 'res-1',
            resourceId: '1020304050',
            name: 'Acme Ad Account',
            currency: 'USD',
            timezone: 'America/New_York',
          },
        ],
      });

      const res = await getPendingMetaResourcesAction(pendingId, orgId, clientId);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.value).toHaveLength(1);
        expect(res.value?.[0]?.resourceId).toBe('1020304050');
      }
    });
  });

  describe('finalizeMetaIntegrationAction', () => {
    it('returns unauthorized when session is missing', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const res = await finalizeMetaIntegrationAction(pendingId, '1020304050', orgId, clientId);
      expect(res).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('successfully finalizes integration with selected account', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockFinalizeMetaConnection.mockResolvedValue({
        success: true,
        value: {
          clientIntegrationId: 'int-uuid-456',
          isReconnect: false,
          eventType: 'connected',
        },
      });

      const res = await finalizeMetaIntegrationAction(pendingId, '1020304050', orgId, clientId);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.value?.clientIntegrationId).toBe('int-uuid-456');
      }
    });
  });

  describe('disconnectMetaIntegrationAction', () => {
    it('successfully disconnects integration', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'admin' } }),
            }),
          }),
        }),
      });

      mockDisconnectMetaIntegration.mockResolvedValue({ success: true });

      const res = await disconnectMetaIntegrationAction('int-uuid-456', orgId, clientId);
      expect(res).toEqual({ success: true });
    });
  });
});
