import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { connectMetaIntegration } from '../connect-meta-integration.use-case';
import { getPendingMetaResources } from '../get-pending-meta-resources.use-case';
import { finalizeMetaAdAccountConnection } from '../finalize-meta-connection.use-case';

describe('Meta Integration Use Cases (Phase 9B.6B)', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const clientId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const pendingId = '44444444-4444-4444-4444-444444444444';

  describe('connectMetaIntegration OAuth Scopes', () => {
    it('includes ads_read and organic scopes, but strictly excludes ads_management', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ insert: insertMock }),
      } as unknown as SupabaseClient;

      const res = await connectMetaIntegration(mockSupabase, {
        organizationId: orgId,
        clientId,
        actorUserId: userId,
        redirectUri: 'https://bop-agency.vercel.app/api/auth/oauth/meta/callback',
        appId: 'test-app-id',
        apiVersion: 'v26.0',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        const url = new URL(res.value.oauthUrl);
        const scopeParam = url.searchParams.get('scope') || '';
        const scopes = scopeParam.split(',');

        expect(scopes).toContain('ads_read');
        expect(scopes).not.toContain('ads_management');
        expect(scopes).toContain('pages_show_list');
        expect(scopes).toContain('pages_read_engagement');
        expect(scopes).toContain('pages_manage_posts');
        expect(scopes).toContain('instagram_basic');
        expect(scopes).toContain('instagram_content_publish');

        // Verify ads_read is present exactly once
        const adsReadOccurrences = scopes.filter((s) => s === 'ads_read');
        expect(adsReadOccurrences).toHaveLength(1);
        expect(url.searchParams.has('config_id')).toBe(false);
      }
    });

    it('generates Facebook Login for Business URL with config_id and NO scope when configId is provided', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ insert: insertMock }),
      } as unknown as SupabaseClient;

      const res = await connectMetaIntegration(mockSupabase, {
        organizationId: orgId,
        clientId,
        actorUserId: userId,
        redirectUri: 'https://bop-agency.vercel.app/api/auth/oauth/meta/callback',
        appId: 'test-app-id',
        apiVersion: 'v26.0',
        configId: 'test-config-id-999',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        const url = new URL(res.value.oauthUrl);
        expect(url.searchParams.get('client_id')).toBe('test-app-id');
        expect(url.searchParams.get('redirect_uri')).toBe('https://bop-agency.vercel.app/api/auth/oauth/meta/callback');
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('state')).toBe(res.value.stateNonce);
        expect(url.searchParams.get('config_id')).toBe('test-config-id-999');

        // Critical rule: scope MUST be omitted when using config_id
        expect(url.searchParams.has('scope')).toBe(false);
      }
    });

    it('falls back to classic scopes when configId is whitespace or null', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ insert: insertMock }),
      } as unknown as SupabaseClient;

      const res = await connectMetaIntegration(mockSupabase, {
        organizationId: orgId,
        clientId,
        actorUserId: userId,
        redirectUri: 'https://bop-agency.vercel.app/api/auth/oauth/meta/callback',
        appId: 'test-app-id',
        apiVersion: 'v26.0',
        configId: '   ',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        const url = new URL(res.value.oauthUrl);
        expect(url.searchParams.has('config_id')).toBe(false);
        expect(url.searchParams.has('scope')).toBe(true);
        expect(url.searchParams.get('scope')).toContain('ads_read');
      }
    });
  });

  describe('getPendingMetaResources', () => {
    it('rejects unauthorized roles', async () => {
      const mockSupabase = {} as SupabaseClient;
      const deps = {
        organizationRepository: {
          findMember: vi.fn().mockResolvedValue({ role: 'member' }),
        },
      };

      const res = await getPendingMetaResources(
        mockSupabase,
        { pendingConnectionId: pendingId, organizationId: orgId, clientId, actorUserId: userId },
        deps,
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('FORBIDDEN');
      }
    });

    it('returns error when pending connection is missing or expired', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  organization_id: orgId,
                  client_id: clientId,
                  user_id: userId,
                  provider: 'meta',
                  expires_at: new Date(Date.now() - 1000).toISOString(), // expired
                  consumed_at: null,
                },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const deps = {
        organizationRepository: {
          findMember: vi.fn().mockResolvedValue({ role: 'admin' }),
        },
      };

      const res = await getPendingMetaResources(
        mockSupabase,
        { pendingConnectionId: pendingId, organizationId: orgId, clientId, actorUserId: userId },
        deps,
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.message).toContain('expired');
      }
    });

    it('rejects user mismatch', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  organization_id: orgId,
                  client_id: clientId,
                  user_id: 'other-user',
                  provider: 'meta',
                  expires_at: new Date(Date.now() + 60000).toISOString(),
                  consumed_at: null,
                },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const deps = {
        organizationRepository: {
          findMember: vi.fn().mockResolvedValue({ role: 'owner' }),
        },
      };

      const res = await getPendingMetaResources(
        mockSupabase,
        { pendingConnectionId: pendingId, organizationId: orgId, clientId, actorUserId: userId },
        deps,
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.message).toContain('belongs to a different user');
      }
    });

    it('returns discovered resources on valid pending session', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'pending_oauth_connections') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      organization_id: orgId,
                      client_id: clientId,
                      user_id: userId,
                      provider: 'meta',
                      expires_at: new Date(Date.now() + 60000).toISOString(),
                      consumed_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'pending_oauth_resources') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'res-1',
                      page_id: '1020304050',
                      page_name: 'Main Ad Account',
                      instagram_account_id: 'USD',
                      instagram_username: 'America/New_York',
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as SupabaseClient;

      const deps = {
        organizationRepository: {
          findMember: vi.fn().mockResolvedValue({ role: 'strategist' }),
        },
      };

      const res = await getPendingMetaResources(
        mockSupabase,
        { pendingConnectionId: pendingId, organizationId: orgId, clientId, actorUserId: userId },
        deps,
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.value).toHaveLength(1);
        expect(res.value[0]).toEqual({
          id: 'res-1',
          resourceId: '1020304050',
          name: 'Main Ad Account',
          currency: 'USD',
          timezone: 'America/New_York',
        });
      }
    });
  });

  describe('finalizeMetaAdAccountConnection', () => {
    it('calls finalize_meta_connection RPC with selectedAccountId as p_selected_page_id', async () => {
      const rpcMock = vi.fn().mockResolvedValue({
        data: {
          success: true,
          client_integration_id: 'int-123-uuid',
          is_reconnect: false,
          event_type: 'connected',
        },
        error: null,
      });

      const mockSupabase = {
        rpc: rpcMock,
      } as unknown as SupabaseClient;

      const res = await finalizeMetaAdAccountConnection(mockSupabase, {
        pendingConnectionId: pendingId,
        selectedAccountId: 'act-998877',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.value.clientIntegrationId).toBe('int-123-uuid');
        expect(res.value.eventType).toBe('connected');
      }

      expect(rpcMock).toHaveBeenCalledWith('finalize_meta_connection', {
        p_pending_connection_id: pendingId,
        p_selected_page_id: 'act-998877',
      });
    });
  });
});
